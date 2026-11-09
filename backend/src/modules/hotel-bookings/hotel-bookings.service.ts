import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'node:crypto';
import { ClientSession, Connection, Model, Types } from 'mongoose';

import { BookingStatus, BookingType, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertOwner, sameId } from '../../common/utils/access.util';
import { validateHotelStay } from '../hotels/hotel-search.logic';
import { HotelInventoryService } from '../hotels/hotel-inventory.service';
import { hasLiveRoomReservation } from '../hotels/room-reservation.logic';
import { HotelStatus } from '../hotels/schemas/hotel.schema';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingConfirmationHandler, BookingPaymentContext } from '../payments/booking-confirmation-handler.interface';
import { PaymentHooksService } from '../payments/payment-hooks.service';
import { PaymentsService } from '../payments/payments.service';
import { AccountHooksService } from '../users/account-hooks.service';
import { CreateHotelBookingDto } from './dto/hotel-booking.dto';
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';

const HOLD_MINUTES = 10;
const MAX_CRON_BATCH = 200;
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The reservation/booking owner; the Hotels module owns room inventory. */
@Injectable()
export class HotelBookingsService implements OnModuleInit, BookingConfirmationHandler {
  private readonly logger = new Logger(HotelBookingsService.name);

  constructor(
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBookingDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly inventory: HotelInventoryService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly paymentHooks: PaymentHooksService,
    private readonly accountHooks: AccountHooksService,
  ) {}

  onModuleInit() {
    this.paymentHooks.register(BookingType.Hotel, this);
    this.accountHooks.registerDeactivationCheck('hotel-bookings', async (userId) => {
      const count = await this.bookings
        .countDocuments({
          userId: new Types.ObjectId(userId),
          status: BookingStatus.Confirmed,
          checkOut: { $gt: new Date().toISOString().slice(0, 10) },
        })
        .exec();
      return count ? `You have ${count} upcoming confirmed hotel booking(s)` : null;
    });
  }

  /** HTL-16: review the server-calculated price; NO rooms are held by this endpoint. */
  async summary(user: AuthUser, dto: CreateHotelBookingDto) {
    this.assertTraveller(user);
    const draft = await this.buildDraft(dto);
    return {
      hotelId: String(draft.hotelId),
      hotelName: draft.hotelName,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      nights: draft.nights,
      rooms: draft.rooms.map((r) => ({ ...r, roomId: String(r.roomId) })),
      guestCount: draft.guestCount,
      currency: draft.currency,
      totalMinor: draft.totalMinor,
      checkInTime: draft.checkInTime,
      checkOutTime: draft.checkOutTime,
      cancellationTiers: draft.cancellationTiers,
      inventoryHeld: false,
    };
  }

  /** HTL-18: all selected rooms + one pending booking commit as ONE atomic transaction. */
  async createHold(user: AuthUser, dto: CreateHotelBookingDto) {
    this.assertTraveller(user);
    const bookingId = new Types.ObjectId();
    const reference = this.newReference();
    const userId = new Types.ObjectId(user.id);

    const booking = await this.connection.transaction(async (session) => {
      const draft = await this.buildDraft(dto, session);
      const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

      // Use stable room order to minimize transactional contention.
      const roomIds = draft.rooms.map((room) => String(room.roomId)).sort();
      for (const roomId of roomIds) {
        const claimed = await this.inventory.reserve(
          dto.hotelId,
          roomId,
          bookingId,
          dto.checkIn,
          dto.checkOut,
          expiresAt,
          session,
        );
        if (!claimed) {
          throw new ConflictException({
            message: 'At least one selected room is no longer available; no rooms were held',
            code: 'ROOM_UNAVAILABLE',
            errors: [{ field: 'rooms', messages: [`Room ${roomId} cannot be held`] }],
          });
        }
      }

      const [created] = await this.bookings.create(
        [{ _id: bookingId, reference, userId, ...draft, holdExpiresAt: expiresAt }],
        { session },
      );
      return created;
    });

    return this.toView(booking);
  }

  /** Revalidate every field against the *current* room records and price. */
  private async buildDraft(dto: CreateHotelBookingDto, session?: ClientSession) {
    const nights = validateHotelStay(dto.checkIn, dto.checkOut);
    if (!dto.rooms?.length || dto.rooms.length > 10) {
      throw new BadRequestException('Select between 1 and 10 rooms');
    }

    const ids = dto.rooms.map((r) => r.roomId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({ message: 'A room can be selected only once', code: 'DUPLICATE_ROOM' });
    }

    let totalAdults = 0;
    let guestCount = 0;
    for (const room of dto.rooms) {
      if (
        !Number.isSafeInteger(room.adults) ||
        room.adults < 0 ||
        room.adults > 20 ||
        !Array.isArray(room.childrenAges)
      ) {
        throw new BadRequestException('Invalid adults or childrenAges');
      }
      if (room.childrenAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
        throw new BadRequestException('Children must have ages 0–17');
      }
      const occupants = room.adults + room.childrenAges.length;
      if (occupants < 1) throw new BadRequestException('Each selected room must have at least one guest');
      totalAdults += room.adults;
      guestCount += occupants;
    }
    if (totalAdults < 1) {
      throw new BadRequestException({
        message: 'At least one adult is required per reservation',
        code: 'ADULT_REQUIRED',
      });
    }

    const hotel = await this.inventory.getHotel(dto.hotelId, session);
    if (!hotel || hotel.status !== HotelStatus.Active) {
      throw new NotFoundException('Hotel not found or unavailable');
    }
    const rooms = await this.inventory.getRooms(dto.hotelId, ids, session);
    if (rooms.length !== ids.length) {
      throw new BadRequestException({
        message: 'Every selected room must belong to the hotel',
        code: 'ROOM_HOTEL_MISMATCH',
      });
    }
    const byId = new Map(rooms.map((room) => [String(room._id), room]));
    const now = new Date();
    let totalMinor = 0;
    const snapshots = dto.rooms.map((assignment) => {
      const room = byId.get(assignment.roomId);
      if (!room) throw new BadRequestException('Unknown room');
      const occupants = assignment.adults + assignment.childrenAges.length;
      if (occupants > room.maxOccupancy) {
        throw new BadRequestException({
          message: `Room ${room.roomLabel} supports at most ${room.maxOccupancy} guests`,
          code: 'ROOM_OCCUPANCY_EXCEEDED',
        });
      }
      if (
        !this.inventory.isScheduleAvailable(room, dto.checkIn, dto.checkOut) ||
        hasLiveRoomReservation(room.reservationLocks, dto.checkIn, dto.checkOut, now)
      ) {
        throw new ConflictException({
          message: `Room ${room.roomLabel} is unavailable for the selected stay`,
          code: 'ROOM_UNAVAILABLE',
        });
      }
      const roomTotal = room.pricePerNightMinor * nights;
      totalMinor += roomTotal;
      return {
        roomId: room._id,
        roomLabel: room.roomLabel,
        roomType: room.roomType,
        adults: assignment.adults,
        childrenAges: [...assignment.childrenAges],
        maxOccupancy: room.maxOccupancy,
        pricePerNightMinor: room.pricePerNightMinor,
        totalMinor: roomTotal,
      };
    });
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
      throw new BadRequestException('Booking total is outside the supported amount range');
    }

    return {
      hotelId: new Types.ObjectId(dto.hotelId),
      hotelName: hotel.name,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      nights,
      rooms: snapshots,
      guestCount,
      totalMinor,
      currency: this.config.get<string>('platformCurrency'),
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: (hotel.cancellationTiers ?? []).map((tier) => ({
        minDays: tier.minDays,
        refundPercent: tier.refundPercent,
      })),
    };
  }

  /** PAY-02: checkout only while the booking is still owned, unpaid and unexpired. */
  async getPaymentContext(bookingId: string, user: AuthUser): Promise<BookingPaymentContext> {
    const booking = await this.bookings.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    assertOwner(booking.userId, user, { resource: 'Booking' });
    if (booking.status !== BookingStatus.PendingPayment) {
      throw new ConflictException({ message: `Booking is ${booking.status}`, code: 'BOOKING_NOT_PAYABLE' });
    }
    if (booking.holdExpiresAt <= new Date()) {
      throw new ConflictException({ message: 'The 10-minute hold has expired', code: 'HOLD_EXPIRED' });
    }
    return {
      ownerId: String(booking.userId),
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      reference: booking.reference,
      link: this.link(booking),
      holdExpiresAt: booking.holdExpiresAt,
      policies: {
        hotelName: booking.hotelName,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        checkInTime: booking.checkInTime,
        checkOutTime: booking.checkOutTime,
        cancellationTiers: booking.cancellationTiers,
        roomPrices: booking.rooms.map((r) => ({
          roomLabel: r.roomLabel,
          pricePerNightMinor: r.pricePerNightMinor,
          totalMinor: r.totalMinor,
        })),
      },
    };
  }

  /** HTL-17: Stripe success -> all room locks confirmed and booking confirmed in one transaction. */
  async onPaymentSucceeded(bookingId: string, paymentId: string): Promise<boolean> {
    const paymentObjectId = new Types.ObjectId(paymentId);
    const confirmed = await this.connection
      .transaction(async (session) => {
        const booking = await this.bookings.findById(bookingId).session(session).exec();
        if (!booking || booking.status !== BookingStatus.PendingPayment || booking.holdExpiresAt <= new Date()) {
          return null;
        }
        for (const room of booking.rooms) {
          const locked = await this.inventory.confirm(room.roomId, booking._id, session);
          if (!locked) {
            throw new ConflictException({ message: 'A room lock was lost during payment', code: 'ROOM_LOCK_MISSING' });
          }
        }
        const updated = await this.bookings
          .findOneAndUpdate(
            { _id: booking._id, status: BookingStatus.PendingPayment, holdExpiresAt: { $gt: new Date() } },
            { $set: { status: BookingStatus.Confirmed, confirmedAt: new Date(), paymentId: paymentObjectId } },
            { session, new: true },
          )
          .exec();
        // Never commit confirmed room locks while the booking itself is still pending.
        if (!updated)
          throw new ConflictException({ message: 'Booking hold expired during confirmation', code: 'HOLD_EXPIRED' });
        return updated;
      })
      .catch((error) => {
        // If the deadline was crossed during the transaction, all room updates rolled back.
        // Tell PaymentsService to issue the late-payment refund instead of retrying forever.
        if (error instanceof ConflictException && (error.getResponse() as any)?.code === 'HOLD_EXPIRED') {
          return null;
        }
        throw error;
      });

    if (!confirmed) {
      const current = await this.bookings.findById(bookingId).select('status paymentId').lean().exec();
      return current?.status === BookingStatus.Confirmed && sameId(current.paymentId, paymentObjectId);
    }

    await this.notifications.notify(confirmed.userId, {
      type: NotificationType.BookingConfirmed,
      title: 'Hotel booking confirmed',
      message: `Booking ${confirmed.reference} at ${confirmed.hotelName} is confirmed, ${confirmed.checkIn} to ${confirmed.checkOut}, ${confirmed.rooms.length} room(s).`,
      link: this.link(confirmed),
      data: { bookingId: String(confirmed._id), reference: confirmed.reference, totalMinor: confirmed.totalMinor },
    });
    return true;
  }

  /** HTL-17 confirmation page: the owner can fetch the updated booking status and reference. */
  async getOne(user: AuthUser, bookingId: string) {
    const booking = await this.bookings.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    assertOwner(booking.userId, user, { allowAdmin: true, resource: 'Booking' });
    return {
      ...this.toView(booking),
      payment: await this.payments.summaryForBooking(BookingType.Hotel, booking._id),
    };
  }

  /** HTL-18: expiry after 10 minutes; all pending locks are released transactionally. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    const due = await this.bookings
      .find({ status: BookingStatus.PendingPayment, holdExpiresAt: { $lte: new Date() } })
      .select('_id')
      .limit(MAX_CRON_BATCH)
      .lean()
      .exec();
    for (const booking of due) {
      await this.expireOne(booking._id).catch((err) =>
        this.logger.error(`Failed to expire hotel booking ${booking._id}: ${(err as Error).message}`),
      );
    }
  }

  private async expireOne(bookingId: Types.ObjectId) {
    const expired = await this.connection.transaction(async (session) => {
      const booking = await this.bookings
        .findOneAndUpdate(
          { _id: bookingId, status: BookingStatus.PendingPayment, holdExpiresAt: { $lte: new Date() } },
          { $set: { status: BookingStatus.Expired, expiredAt: new Date() } },
          { session, new: true },
        )
        .exec();
      if (!booking) return null;
      for (const room of booking.rooms) {
        await this.inventory.release(room.roomId, booking._id, session);
      }
      return booking;
    });
    if (!expired) return null;
    await this.payments.cancelOpenIntent(BookingType.Hotel, expired._id);
    await this.notifications.notify(expired.userId, {
      type: NotificationType.BookingExpired,
      title: 'Hotel booking hold expired',
      message: `Booking ${expired.reference} was not paid within 10 minutes; the rooms were released.`,
      link: this.link(expired),
      data: { bookingId: String(expired._id), reference: expired.reference },
    });
    return expired;
  }

  private assertTraveller(user: AuthUser) {
    if (!user || user.role !== Role.User) throw new ForbiddenException('Registered user role required');
  }

  private newReference(): string {
    let ref = 'HTL-';
    for (let i = 0; i < 8; i++) ref += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    return ref;
  }

  private link(booking: { _id: Types.ObjectId }) {
    return `/bookings/hotels/${booking._id}`;
  }

  private toView(booking: HotelBookingDocument) {
    return {
      id: String(booking._id),
      reference: booking.reference,
      status: booking.status,
      hotelId: String(booking.hotelId),
      hotelName: booking.hotelName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      checkInTime: booking.checkInTime,
      checkOutTime: booking.checkOutTime,
      cancellationTiers: booking.cancellationTiers,
      nights: booking.nights,
      guestCount: booking.guestCount,
      rooms: booking.rooms.map((r) => ({
        roomId: String(r.roomId),
        roomLabel: r.roomLabel,
        roomType: r.roomType,
        adults: r.adults,
        childrenAges: r.childrenAges,
        maxOccupancy: r.maxOccupancy,
        pricePerNightMinor: r.pricePerNightMinor,
        totalMinor: r.totalMinor,
      })),
      totalMinor: booking.totalMinor,
      currency: booking.currency,
      holdExpiresAt: booking.holdExpiresAt,
      confirmedAt: booking.confirmedAt ?? null,
      expiredAt: booking.expiredAt ?? null,
      paymentId: booking.paymentId ? String(booking.paymentId) : null,
      createdAt: booking.createdAt,
    };
  }
}
