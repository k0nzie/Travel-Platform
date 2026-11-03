import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import { DateTime } from 'luxon';
import { ClientSession, Connection, FilterQuery, Model, Types } from 'mongoose';
import { BookingStatus, BookingType, canTransition } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertOwner, sameId } from '../../common/utils/access.util';
import { escapeRegex, paginate } from '../../common/utils/paginate';
import { daysUntil, localDayRangeUtc, parseDateOnly, utcToLocalIso } from '../../common/utils/time.util';
import { FlightBookingQueryDto as StaffBookingQueryDto } from '../flights/dto/flights.dto';
import {
  FlightBookingRow,
  FlightBookingsBridge,
  FlightCancellationResult,
  FlightHooksService,
} from '../flights/flight-hooks.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingConfirmationHandler, BookingPaymentContext } from '../payments/booking-confirmation-handler.interface';
import { PaymentHooksService } from '../payments/payment-hooks.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { AccountHooksService } from '../users/account-hooks.service';
import { CreateFlightBookingDto, FlightBookingQueryDto, PassengerDto } from './dto/flight-booking.dto';
import { ETicketService } from './e-ticket.service';
import { FLIGHT_INVENTORY, FlightInventoryPort, FlightSnapshot, PassengerType } from './ports/flight-inventory.port';
import { BookingLeg, FlightBooking, FlightBookingDocument } from './schemas/flight-booking.schema';

const HOLD_MINUTES = 10; // FLT-22
const CHILD_MIN_AGE = 2;
const ADULT_MIN_AGE = 12;
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes: 0/O, 1/I/L
const REFERENCE_LENGTH = 8;
const JOB_BATCH = 200;

/** Never leaves the service in lists shown to moderators or admins. */
const STAFF_SAFE_SELECT = '-passengers.passportNumber -passengers.dateOfBirth';

type StaffBookingDoc = Pick<
  FlightBooking,
  'reference' | 'legs' | 'passengers' | 'seatCount' | 'status' | 'createdAt'
> & {
  _id: Types.ObjectId;
};

/** Seat counters disagree with the booking (e.g. the flight was cancelled mid-payment). */
class SeatMoveError extends Error {}

@Injectable()
export class FlightBookingsService implements OnModuleInit, BookingConfirmationHandler, FlightBookingsBridge {
  private readonly logger = new Logger(FlightBookingsService.name);

  constructor(
    @InjectModel(FlightBooking.name) private readonly bookingModel: Model<FlightBookingDocument>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(FLIGHT_INVENTORY) private readonly inventory: FlightInventoryPort,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly hooks: AccountHooksService,
    private readonly referenceData: ReferenceDataService,
    private readonly eTickets: ETicketService,
    private readonly config: ConfigService,
    private readonly flightHooks: FlightHooksService,
    private readonly paymentHooks: PaymentHooksService,
  ) {}

  onModuleInit() {
    // Cross-module hooks (docs/CONVENTIONS.md): payments, flights and accounts call back into bookings.
    this.paymentHooks.register(BookingType.Flight, this);
    // FLT-05, FLT-06, FLT-29: flights calls back through this bridge instead of touching bookings.
    this.flightHooks.register(this);
    // ACC-12: flights still ahead, or under way, block deactivation.
    this.hooks.registerDeactivationCheck('flight-bookings', async (userId) => {
      const count = await this.bookingModel
        .countDocuments({
          userId: new Types.ObjectId(userId),
          status: BookingStatus.Confirmed,
          lastArrivalAt: { $gt: new Date() },
        })
        .exec();
      return count ? `You have ${count} upcoming confirmed flight booking(s)` : null;
    });
  }

  // ---------- quote + hold ----------

  /** FLT-21: price summary for the review step. Holds nothing. */
  async quote(dto: CreateFlightBookingDto) {
    const draft = await this.buildDraft(dto);
    return {
      currency: draft.currency,
      seatCount: draft.seatCount,
      totalMinor: draft.totalMinor,
      legs: draft.legs.map((leg) => this.legView(leg)),
    };
  }

  /** FLT-22: holds the seats for 10 minutes and creates the PendingPayment booking. */
  async createHold(user: AuthUser, dto: CreateFlightBookingDto) {
    const draft = await this.buildDraft(dto);
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

    const booking = await this.connection.transaction(async (session) => {
      for (const leg of draft.legs) {
        const held = await this.inventory.reserveSeats(String(leg.flightId), leg.cabinClass, draft.seatCount, session);
        if (!held) {
          throw new ConflictException({
            message: `Not enough ${leg.cabinClass} seats left on ${leg.flightNumber}`,
            code: 'SEATS_UNAVAILABLE',
            errors: [{ field: 'legs', messages: [`Not enough seats on ${leg.flightNumber}`] }],
          });
        }
      }
      const [created] = await this.bookingModel.create(
        [{ ...draft, reference: this.generateReference(), userId: new Types.ObjectId(user.id), holdExpiresAt }],
        { session },
      );
      return created;
    });

    return this.toView(booking);
  }

  /** Validates everything (FLT-12, FLT-19, FLT-21) and prices the booking on the server. */
  private async buildDraft(dto: CreateFlightBookingDto) {
    const flights = await Promise.all(dto.legs.map((leg) => this.loadBookableFlight(leg.flightId)));
    this.assertItinerary(flights);
    const seatCount = await this.assertPassengers(dto.passengers, flights[0].departureAt);

    const currency = this.config.get<string>('platformCurrency');
    const legs: BookingLeg[] = flights.map((flight, i) => {
      if (flight.currency !== currency) {
        throw new InternalServerErrorException(`Flight ${flight.flightNumber} is not priced in ${currency}`);
      }
      const cabinClass = dto.legs[i].cabinClass;
      const cabin = flight.cabins.find((c) => c.cabinClass === cabinClass);
      if (!cabin) {
        throw new BadRequestException({
          message: `${flight.flightNumber} has no ${cabinClass} cabin`,
          errors: [{ field: `legs.${i}.cabinClass`, messages: [`${flight.flightNumber} has no ${cabinClass} cabin`] }],
        });
      }

      const policy = cabin.baggagePolicy;
      dto.passengers.forEach((p, n) => {
        if ((p.extraBags ?? 0) > policy.maxExtraBagsPerPassenger) {
          throw new BadRequestException({
            message: `At most ${policy.maxExtraBagsPerPassenger} extra bags per passenger on ${flight.flightNumber}`,
            errors: [{ field: `passengers.${n}.extraBags`, messages: ['Too many extra bags'] }],
          });
        }
      });

      return {
        flightId: new Types.ObjectId(flight.flightId),
        flightNumber: flight.flightNumber,
        airlineId: new Types.ObjectId(flight.airlineId),
        airlineName: flight.airlineName,
        origin: flight.origin,
        destination: flight.destination,
        departureAt: flight.departureAt,
        arrivalAt: flight.arrivalAt,
        cabinClass,
        fareMinor: dto.passengers.reduce((sum, p) => sum + cabin.fares[p.type], 0),
        baggageMinor: dto.passengers.reduce((sum, p) => sum + (p.extraBags ?? 0) * policy.extraBagPriceMinor, 0),
        baggagePolicy: policy,
        cancellationTiers: flight.cancellationTiers,
      };
    });

    return {
      legs,
      seatCount,
      passengers: dto.passengers.map((p) => ({
        ...p,
        extraBags: p.extraBags ?? 0,
        dateOfBirth: parseDateOnly(p.dateOfBirth),
      })),
      currency,
      totalMinor: legs.reduce((sum, leg) => sum + leg.fareMinor + leg.baggageMinor, 0),
      departureAt: legs[0].departureAt,
      lastArrivalAt: legs[legs.length - 1].arrivalAt,
    };
  }

  private async loadBookableFlight(flightId: string) {
    const flight = await this.inventory.getFlightForBooking(flightId);
    if (!flight) throw new NotFoundException('Flight not found');
    if (!flight.bookable || flight.departureAt <= new Date()) {
      throw new ConflictException({
        message: `Flight ${flight.flightNumber} can no longer be booked`,
        code: 'FLIGHT_NOT_BOOKABLE',
      });
    }
    return flight;
  }

  /** A round-trip must come back the same way, after the outbound has landed. */
  private assertItinerary(flights: FlightSnapshot[]) {
    if (flights.length < 2) return;
    const [out, back] = flights;
    const reversed =
      out.origin.iataCode === back.destination.iataCode && out.destination.iataCode === back.origin.iataCode;
    if (!reversed || back.departureAt <= out.arrivalAt) {
      throw new BadRequestException({
        message: 'The return flight must reverse the outbound route and leave after it lands',
        code: 'INVALID_ROUND_TRIP',
        errors: [{ field: 'legs', messages: ['Invalid return flight'] }],
      });
    }
  }

  /** FLT-12 rules. Returns how many seats are needed: infants have none. */
  private async assertPassengers(passengers: PassengerDto[], departureAt: Date) {
    const fail = (field: string, message: string) =>
      new BadRequestException({ message, errors: [{ field, messages: [message] }] });

    const count = (type: PassengerType) => passengers.filter((p) => p.type === type).length;
    const adults = count(PassengerType.Adult);
    if (!adults) throw fail('passengers', 'At least one adult must travel on every booking');
    if (count(PassengerType.Infant) > adults) {
      throw fail('passengers', 'Each infant must be accompanied by their own adult');
    }

    const departure = DateTime.fromJSDate(departureAt, { zone: 'utc' });
    passengers.forEach((p, i) => {
      const born = DateTime.fromISO(p.dateOfBirth, { zone: 'utc' });
      if (born > DateTime.utc()) throw fail(`passengers.${i}.dateOfBirth`, 'Date of birth is in the future');
      const age = Math.floor(departure.diff(born, 'years').years);
      const actual =
        age >= ADULT_MIN_AGE ? PassengerType.Adult : age >= CHILD_MIN_AGE ? PassengerType.Child : PassengerType.Infant;
      if (actual !== p.type) {
        throw fail(`passengers.${i}.type`, `Passenger is ${age} at departure, which is a ${actual} fare`);
      }
    });

    await this.referenceData.assertCountryCodes(passengers.map((p) => p.nationality));
    return passengers.length - count(PassengerType.Infant);
  }

  private generateReference() {
    let reference = '';
    for (let i = 0; i < REFERENCE_LENGTH; i++) {
      reference += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    }
    return reference;
  }

  // ---------- GEN-11 state machine ----------

  /** The only place status changes. The filter is what stops two jobs racing. */
  private moveStatus(
    id: Types.ObjectId | string,
    from: BookingStatus,
    to: BookingStatus,
    extra: { filter?: FilterQuery<FlightBooking>; set?: Record<string, unknown> },
    session: ClientSession,
  ) {
    if (!canTransition(from, to)) {
      throw new InternalServerErrorException(`Illegal booking transition ${from} -> ${to}`);
    }
    return this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: from, ...extra.filter },
        { $set: { status: to, ...extra.set } },
        { new: true, session },
      )
      .exec();
  }

  private async eachLeg(
    booking: FlightBookingDocument,
    seatMove: 'releaseSeats' | 'convertHeldToBooked' | 'releaseBookedSeats',
    session: ClientSession,
  ) {
    for (const leg of booking.legs) {
      const ok = await this.inventory[seatMove](String(leg.flightId), leg.cabinClass, booking.seatCount, session);
      if (!ok) {
        // Counters disagree with the booking; abort the transaction rather than silently drift.
        throw new SeatMoveError(`${seatMove} failed for booking ${booking.reference}`);
      }
    }
  }

  // ---------- BookingConfirmationHandler (PAY-01, PAY-02) ----------

  async getPaymentContext(bookingId: string, user: AuthUser): Promise<BookingPaymentContext> {
    const booking = await this.bookingModel.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    assertOwner(booking.userId, user, { resource: 'Booking' });

    if (booking.status !== BookingStatus.PendingPayment) {
      throw new ConflictException({
        message: `This booking is ${booking.status} and cannot be paid for`,
        code: 'BOOKING_NOT_PAYABLE',
      });
    }
    if (booking.holdExpiresAt <= new Date()) {
      throw new ConflictException({ message: 'Your 10-minute hold has expired', code: 'HOLD_EXPIRED' });
    }

    return {
      ownerId: String(booking.userId),
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      reference: booking.reference,
      link: this.link(booking),
      holdExpiresAt: booking.holdExpiresAt,
      policies: {
        flights: booking.legs.map((leg) => ({
          flightNumber: leg.flightNumber,
          baggage: leg.baggagePolicy,
          cancellationTiers: leg.cancellationTiers,
        })),
      },
    };
  }

  async onPaymentSucceeded(bookingId: string, paymentId: string) {
    const paymentObjectId = new Types.ObjectId(paymentId);
    const confirmed = await this.confirmPaid(bookingId, paymentObjectId).catch(async (err) => {
      if (!(err instanceof SeatMoveError)) throw err;
      // The flight stopped being bookable while the customer paid (cancelled or departed):
      // release the hold; returning false makes PaymentsService refund in full.
      this.logger.warn(`Payment for booking ${bookingId} arrived but seats could not be issued: ${err.message}`);
      await this.expireOne(new Types.ObjectId(bookingId));
      return null;
    });

    if (!confirmed) {
      // Redelivered webhook for a payment already applied, or genuinely too late.
      const existing = await this.bookingModel.findById(bookingId).select('paymentId status').lean().exec();
      return existing?.status !== BookingStatus.Expired && sameId(existing?.paymentId, paymentObjectId);
    }

    await this.notifications.notify(confirmed.userId, {
      type: NotificationType.BookingConfirmed,
      title: 'Flight booking confirmed',
      message: `Your booking ${confirmed.reference} is confirmed. Your e-ticket is ready to download.`,
      link: this.link(confirmed),
      data: { bookingId: String(confirmed._id), reference: confirmed.reference },
    });
    return true;
  }

  /** PendingPayment -> Confirmed and held -> booked seats, in one transaction (FLT-23). */
  private confirmPaid(bookingId: string, paymentObjectId: Types.ObjectId) {
    return this.connection.transaction(async (session) => {
      const booking = await this.bookingModel.findById(bookingId).session(session).exec();
      if (booking?.status !== BookingStatus.PendingPayment) return null;

      // Not filtered on holdExpiresAt: while the seats are still held a late
      // webhook can confirm. Once the expiry job has run, status decides.
      const updated = await this.moveStatus(
        bookingId,
        BookingStatus.PendingPayment,
        BookingStatus.Confirmed,
        {
          set: {
            confirmedAt: new Date(),
            paymentId: paymentObjectId,
            passengers: booking.toObject().passengers.map((p, i) => ({
              ...p,
              ticketNumber: `${booking.reference}-${String(i + 1).padStart(2, '0')}`,
            })),
          },
        },
        session,
      );
      if (updated) await this.eachLeg(updated, 'convertHeldToBooked', session);
      return updated;
    });
  }

  // ---------- my bookings ----------

  /** FLT-25: grouped as Upcoming, Past and Cancelled via `scope`. */
  list(user: AuthUser, query: FlightBookingQueryDto) {
    const filter: FilterQuery<FlightBooking> = { userId: new Types.ObjectId(user.id) };
    if (query.status) filter.status = query.status;
    const now = new Date();
    if (query.scope === 'upcoming') {
      filter.departureAt = { $gt: now };
      filter.status ??= { $in: [BookingStatus.PendingPayment, BookingStatus.Confirmed] };
    } else if (query.scope === 'past') {
      filter.status ??= { $in: [BookingStatus.Confirmed, BookingStatus.Completed, BookingStatus.Expired] };
      filter.$or = [
        { departureAt: { $lte: now } },
        { status: { $in: [BookingStatus.Completed, BookingStatus.Expired] } },
      ];
    } else if (query.scope === 'cancelled') {
      filter.status = BookingStatus.Cancelled;
    }
    return paginate(this.bookingModel, filter, {
      page: query.page,
      limit: query.limit,
      sort: { departureAt: query.scope === 'upcoming' ? 1 : -1, _id: -1 },
      select: '-passengers.passportNumber',
    });
  }

  /** FLT-25 details, with payment and refund status (PAY-03). */
  async getOne(user: AuthUser, id: string) {
    const booking = await this.loadOwned(user, id);
    return { ...this.toView(booking), payment: await this.payments.summaryForBooking(BookingType.Flight, booking._id) };
  }

  private async loadOwned(user: AuthUser, id: string, opts: { allowAdmin?: boolean } = { allowAdmin: true }) {
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    assertOwner(booking.userId, user, { allowAdmin: opts.allowAdmin, resource: 'Booking' });
    return booking;
  }

  /** FLT-23 */
  async eTicket(user: AuthUser, id: string) {
    const booking = await this.loadOwned(user, id);
    if (![BookingStatus.Confirmed, BookingStatus.Completed].includes(booking.status)) {
      throw new ConflictException({
        message: 'An e-ticket is only available for confirmed bookings',
        code: 'TICKET_UNAVAILABLE',
      });
    }
    return { reference: booking.reference, pdf: await this.eTickets.render(booking) };
  }

  // ---------- cancellation ----------

  /**
   * FLT-26 / FLT-12a: the booking is cancelled as a whole. The refund uses the outbound
   * segment's tier (FLT-09, highest threshold not exceeding the days left before the
   * outbound departure) applied to the full amount paid, baggage included.
   */
  private computeRefund(booking: FlightBookingDocument) {
    const outbound = booking.legs[0];
    const daysRemaining = daysUntil(outbound.departureAt);
    const refundPercent = this.inventory.computeRefundPercent(outbound.cancellationTiers, daysRemaining);
    return {
      flightNumber: outbound.flightNumber,
      daysRemaining,
      refundPercent,
      paidMinor: booking.totalMinor,
      refundMinor: Math.round((booking.totalMinor * refundPercent) / 100),
      currency: booking.currency,
    };
  }

  private assertCancellable(booking: FlightBookingDocument) {
    if (booking.status !== BookingStatus.Confirmed) {
      throw new ConflictException({
        message: `A ${booking.status} booking cannot be cancelled`,
        code: 'BOOKING_NOT_CANCELLABLE',
      });
    }
    if (booking.departureAt <= new Date()) {
      throw new ConflictException({
        message: 'This booking can no longer be cancelled because the flight has departed',
        code: 'FLIGHT_DEPARTED',
      });
    }
  }

  /** FLT-26: what the traveller would get back, shown before they confirm. */
  async cancellationPreview(user: AuthUser, id: string) {
    const booking = await this.loadOwned(user, id, { allowAdmin: false });
    this.assertCancellable(booking);
    return this.computeRefund(booking);
  }

  async cancel(user: AuthUser, id: string, reason?: string) {
    const booking = await this.loadOwned(user, id, { allowAdmin: false });
    this.assertCancellable(booking);
    const { refundMinor } = this.computeRefund(booking);

    const cancelled = await this.cancelConfirmed(booking, { cancelledBy: 'user', refundMinor, reason });
    if (!cancelled) {
      throw new ConflictException({ message: 'This booking was already cancelled', code: 'BOOKING_NOT_CANCELLABLE' });
    }

    const refund = (refundMinor / 100).toFixed(2);
    await this.notifications.notify(cancelled.userId, {
      type: NotificationType.BookingCancelled,
      title: 'Flight booking cancelled',
      message: refundMinor
        ? `Booking ${cancelled.reference} was cancelled. Refund: ${refund} ${cancelled.currency}.`
        : `Booking ${cancelled.reference} was cancelled. No refund applies under the cancellation policy.`,
      link: this.link(cancelled),
      data: { bookingId: String(cancelled._id), reference: cancelled.reference, refundMinor },
    });
    return this.toView(cancelled);
  }

  /** Status, seats and the refund record all commit together; Stripe is called afterwards. */
  private async cancelConfirmed(
    booking: FlightBookingDocument,
    cancellation: { cancelledBy: 'user' | 'airline'; refundMinor: number; reason?: string },
  ) {
    let refundRecord = null;
    const cancelled = await this.connection.transaction(async (session) => {
      const updated = await this.moveStatus(
        booking._id,
        BookingStatus.Confirmed,
        BookingStatus.Cancelled,
        { set: { cancelledAt: new Date(), cancellation } },
        session,
      );
      if (!updated) return null;
      await this.eachLeg(updated, 'releaseBookedSeats', session);
      refundRecord = await this.payments.queueRefund(
        BookingType.Flight,
        updated._id,
        cancellation.refundMinor,
        `${cancellation.cancelledBy}_cancelled`,
        session,
      );
      if (cancellation.refundMinor > 0 && !refundRecord) {
        // Booking confirmed but its payment isn't marked paid yet. Roll back, never lose a refund.
        throw new ConflictException({
          message: 'Your payment is still settling. Try again shortly.',
          code: 'PAYMENT_SETTLING',
        });
      }
      return updated;
    });
    await this.payments.sendQueuedRefunds(refundRecord);
    return cancelled;
  }

  // ---------- background jobs ----------

  /** FLT-22 */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    const due = await this.bookingModel
      .find({ status: BookingStatus.PendingPayment, holdExpiresAt: { $lte: new Date() } })
      .select('_id')
      .limit(JOB_BATCH)
      .lean()
      .exec();
    for (const { _id } of due) {
      await this.expireOne(_id, { holdExpiresAt: { $lte: new Date() } }).catch((err) =>
        this.logger.error(`Could not expire booking ${_id}: ${err.message}`),
      );
    }
  }

  private async expireOne(id: Types.ObjectId, filter: FilterQuery<FlightBooking> = {}, flightCancelled = false) {
    const expired = await this.connection.transaction(async (session) => {
      const updated = await this.moveStatus(
        id,
        BookingStatus.PendingPayment,
        BookingStatus.Expired,
        { filter, set: { expiredAt: new Date() } },
        session,
      );
      if (updated) await this.eachLeg(updated, 'releaseSeats', session);
      return updated;
    });
    if (!expired) return;

    await this.payments.cancelOpenIntent(BookingType.Flight, id);
    await this.notifications.notify(
      expired.userId,
      flightCancelled
        ? {
            type: NotificationType.FlightCancelled,
            title: 'Your flight was cancelled',
            message: `The airline cancelled a flight on unpaid booking ${expired.reference}; the seat hold was released.`,
            link: this.link(expired),
            data: { bookingId: String(expired._id), reference: expired.reference },
          }
        : {
            type: NotificationType.BookingExpired,
            title: 'Booking hold expired',
            message: `Booking ${expired.reference} was not paid within ${HOLD_MINUTES} minutes and has expired.`,
            link: this.link(expired),
            data: { bookingId: String(expired._id), reference: expired.reference },
          },
    );
    return expired;
  }

  /** GEN-11: Confirmed -> Completed after the last flight lands. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async completeFinishedTrips() {
    const now = new Date();
    await this.bookingModel
      .updateMany(
        { status: BookingStatus.Confirmed, lastArrivalAt: { $lte: now } },
        { status: BookingStatus.Completed, completedAt: now },
      )
      .exec();
  }

  // ---------- FlightBookingsBridge: called by FlightsService (FLT-05, FLT-06, FLT-29) ----------

  /**
   * FLT-06: the flight is already Cancelled. Unpaid holds expire; confirmed bookings are
   * cancelled with a 100% refund (PAY-03), releasing seats on every leg. Safe to call again:
   * only bookings still pending or confirmed are touched, so a retry picks up failures.
   */
  async onFlightCancelled(flightId: string): Promise<FlightCancellationResult> {
    const bookings = await this.activeBookingsOnFlight(flightId);
    const result: FlightCancellationResult = { cancelled: 0, expired: 0, failed: [] };
    for (const booking of bookings) {
      try {
        if (booking.status === BookingStatus.PendingPayment) {
          if (await this.expireOne(booking._id, {}, true)) result.expired++;
          continue;
        }
        const done = await this.cancelConfirmed(booking, {
          cancelledBy: 'airline',
          refundMinor: booking.totalMinor,
          reason: 'Flight cancelled by the airline',
        });
        if (!done) continue;
        result.cancelled++;
        await this.notifications.notify(done.userId, {
          type: NotificationType.FlightCancelled,
          title: 'Your flight was cancelled',
          message: `The airline cancelled a flight on booking ${done.reference}. You will receive a full refund.`,
          link: this.link(done),
          data: { bookingId: String(done._id), reference: done.reference },
        });
      } catch (err) {
        result.failed.push(booking.reference);
        this.logger.error(`Could not cancel booking ${booking.reference}: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /** FLT-05: refresh the booking copies of the new times; notify passengers with Confirmed bookings. */
  async onScheduleChanged(flightId: string) {
    const flight = await this.inventory.getFlightForBooking(flightId);
    if (!flight) throw new NotFoundException('Flight not found');

    const bookings = await this.activeBookingsOnFlight(flightId);
    for (const booking of bookings) {
      const leg = booking.legs.find((l) => sameId(l.flightId, flightId));
      leg.departureAt = flight.departureAt;
      leg.arrivalAt = flight.arrivalAt;
      booking.departureAt = booking.legs[0].departureAt;
      booking.lastArrivalAt = booking.legs[booking.legs.length - 1].arrivalAt;
      await booking.save();
    }

    const confirmed = bookings.filter((b) => b.status === BookingStatus.Confirmed);
    await this.notifications.notifyMany(
      confirmed.map((b) => b.userId),
      {
        type: NotificationType.FlightScheduleChanged,
        title: 'Your flight schedule changed',
        message:
          `Flight ${flight.flightNumber} now departs at ` +
          `${utcToLocalIso(flight.departureAt, flight.origin.timezone)} local time.`,
        data: { flightId },
      },
    );
    return { updated: bookings.length };
  }

  /** FLT-05: airports lock once any booking exists, whatever its status. */
  countForFlight(flightId: string) {
    return this.bookingModel.countDocuments({ 'legs.flightId': new Types.ObjectId(flightId) }).exec();
  }

  /** FLT-29: one row per booking on this flight. Moderator scope is checked by FlightsService. */
  async listForFlight(flightId: string, query: StaffBookingQueryDto) {
    const page = await paginate<StaffBookingDoc>(this.bookingModel, this.staffFilter(flightId, query), {
      page: query.page,
      limit: query.limit,
      sort: { createdAt: -1, _id: -1 },
      select: STAFF_SAFE_SELECT,
    });
    return { ...page, items: page.items.map((b) => this.staffRow(b, flightId)) };
  }

  /** FLT-29 CSV: the same filter, every match up to `max`. */
  async exportForFlight(flightId: string, query: StaffBookingQueryDto, max: number) {
    const rows = await this.bookingModel
      .find(this.staffFilter(flightId, query))
      .select(STAFF_SAFE_SELECT)
      .sort({ createdAt: -1, _id: -1 })
      .limit(max)
      .lean()
      .exec();
    return (rows as unknown as StaffBookingDoc[]).map((b) => this.staffRow(b, flightId));
  }

  /** FLT-29 shows booked passengers (Confirmed or Cancelled); unpaid holds are not bookings yet. */
  private staffFilter(flightId: string, q: StaffBookingQueryDto) {
    const leg: Record<string, unknown> = { flightId: new Types.ObjectId(flightId) };
    if (q.cabin) leg.cabinClass = q.cabin;
    const filter: Record<string, any> = {
      legs: { $elemMatch: leg },
      status: q.status ?? { $in: [BookingStatus.Confirmed, BookingStatus.Completed, BookingStatus.Cancelled] },
    };
    if (q.reference) filter.reference = new RegExp(escapeRegex(q.reference), 'i');
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = localDayRangeUtc(q.from, 'UTC').start;
      if (q.to) filter.createdAt.$lt = localDayRangeUtc(q.to, 'UTC').end;
    }
    return filter;
  }

  private staffRow(booking: StaffBookingDoc, flightId: string): FlightBookingRow {
    const leg = booking.legs.find((l) => sameId(l.flightId, flightId));
    return {
      id: String(booking._id),
      reference: booking.reference,
      passengerNames: booking.passengers.map((p) => `${p.firstName} ${p.lastName}`),
      cabin: leg.cabinClass,
      seats: booking.seatCount,
      status: booking.status,
      createdAt: booking.createdAt,
    };
  }

  private activeBookingsOnFlight(flightId: string) {
    return this.bookingModel
      .find({
        'legs.flightId': new Types.ObjectId(flightId),
        status: { $in: [BookingStatus.PendingPayment, BookingStatus.Confirmed] },
      })
      .exec();
  }

  /** ACC-17: Person 6's read-only admin list. */
  listAllForAdmin(query: FlightBookingQueryDto) {
    const filter: FilterQuery<FlightBooking> = query.status ? { status: query.status } : {};
    return paginate(this.bookingModel, filter, {
      ...query,
      select: STAFF_SAFE_SELECT,
      populate: { path: 'userId', select: 'name email' },
    });
  }

  // ---------- views ----------

  private link(booking: FlightBookingDocument) {
    return `/bookings/flights/${booking._id}`;
  }

  /** GEN-06: stored in UTC, shown in each airport's local time. */
  private legView(leg: BookingLeg) {
    return {
      flightId: String(leg.flightId),
      flightNumber: leg.flightNumber,
      airlineName: leg.airlineName,
      cabinClass: leg.cabinClass,
      origin: leg.origin,
      destination: leg.destination,
      departureAt: leg.departureAt,
      arrivalAt: leg.arrivalAt,
      departureLocal: utcToLocalIso(leg.departureAt, leg.origin.timezone),
      arrivalLocal: utcToLocalIso(leg.arrivalAt, leg.destination.timezone),
      fareMinor: leg.fareMinor,
      baggageMinor: leg.baggageMinor,
      baggagePolicy: leg.baggagePolicy,
      cancellationTiers: leg.cancellationTiers,
    };
  }

  private toView(booking: FlightBookingDocument) {
    return {
      id: String(booking._id),
      reference: booking.reference,
      status: booking.status,
      legs: booking.legs.map((leg) => this.legView(leg)),
      passengers: booking.toObject().passengers,
      seatCount: booking.seatCount,
      totalMinor: booking.totalMinor,
      currency: booking.currency,
      holdExpiresAt: booking.status === BookingStatus.PendingPayment ? booking.holdExpiresAt : undefined,
      paymentId: booking.paymentId,
      cancellation: booking.cancellation,
      confirmedAt: booking.confirmedAt,
      cancelledAt: booking.cancelledAt,
      createdAt: booking.createdAt,
    };
  }
}
