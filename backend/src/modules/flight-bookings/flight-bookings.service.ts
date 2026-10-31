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
import { BookingStatus, BookingType, canTransition, ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates, assertOwner, sameId } from '../../common/utils/access.util';
import { paginate } from '../../common/utils/paginate';
import { daysUntil, parseDateOnly, utcToLocalIso } from '../../common/utils/time.util';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BookingConfirmationHandler,
  BookingPaymentContext,
} from '../payments/booking-confirmation-handler.interface';
import { PaymentsService } from '../payments/payments.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { AccountHooksService } from '../users/account-hooks.service';
import { CreateFlightBookingDto, FlightBookingQueryDto, PassengerDto } from './dto/flight-booking.dto';
import { ETicketService } from './e-ticket.service';
import {
  FLIGHT_INVENTORY,
  FlightInventoryPort,
  FlightSnapshot,
  PassengerType,
} from './ports/flight-inventory.port';
import { BookingLeg, FlightBooking, FlightBookingDocument } from './schemas/flight-booking.schema';

const HOLD_MINUTES = 10; // FLT-22
const CHILD_MIN_AGE = 2;
const ADULT_MIN_AGE = 12;
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes: 0/O, 1/I/L
const REFERENCE_LENGTH = 8;
const JOB_BATCH = 200;

/** Never leaves the service in lists shown to moderators or admins. */
const STAFF_SAFE_SELECT = '-passengers.passportNumber -passengers.dateOfBirth';

@Injectable()
export class FlightBookingsService implements OnModuleInit, BookingConfirmationHandler {
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
  ) {}

  onModuleInit() {
    this.payments.registerHandler(BookingType.Flight, this);
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

      const policy = flight.baggagePolicy;
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
        age >= ADULT_MIN_AGE
          ? PassengerType.Adult
          : age >= CHILD_MIN_AGE
            ? PassengerType.Child
            : PassengerType.Infant;
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
        // Counters disagree with the booking; abort rather than silently drift.
        throw new InternalServerErrorException(`${seatMove} failed for booking ${booking.reference}`);
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
    const confirmed = await this.connection.transaction(async (session) => {
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

    if (!confirmed) {
      // Redelivered webhook for a payment already applied, or genuinely too late.
      const existing = await this.bookingModel.findById(bookingId).select('paymentId').lean().exec();
      return sameId(existing?.paymentId, paymentObjectId);
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

  // ---------- my bookings ----------

  /** FLT-26 */
  list(user: AuthUser, query: FlightBookingQueryDto) {
    const filter: FilterQuery<FlightBooking> = { userId: new Types.ObjectId(user.id) };
    if (query.status) filter.status = query.status;
    if (query.scope === 'upcoming') {
      filter.departureAt = { $gt: new Date() };
      filter.status ??= { $in: [BookingStatus.PendingPayment, BookingStatus.Confirmed] };
    } else if (query.scope === 'past') {
      filter.$or = [
        { departureAt: { $lte: new Date() } },
        { status: { $in: [BookingStatus.Completed, BookingStatus.Expired, BookingStatus.Cancelled] } },
      ];
    }
    return paginate(this.bookingModel, filter, {
      page: query.page,
      limit: query.limit,
      sort: { departureAt: query.scope === 'upcoming' ? 1 : -1, _id: -1 },
      select: '-passengers.passportNumber',
    });
  }

  async getOne(user: AuthUser, id: string) {
    return this.toView(await this.loadOwned(user, id));
  }

  private async loadOwned(user: AuthUser, id: string, opts: { allowAdmin?: boolean } = { allowAdmin: true }) {
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    assertOwner(booking.userId, user, { allowAdmin: opts.allowAdmin, resource: 'Booking' });
    return booking;
  }

  /** FLT-25 */
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

  /** FLT-09: each leg refunds under its own tiers, using the days left until that leg. */
  private computeRefund(booking: FlightBookingDocument) {
    const legs = booking.legs.map((leg) => {
      const daysRemaining = daysUntil(leg.departureAt);
      const refundPercent = this.inventory.computeRefundPercent(leg.cancellationTiers, daysRemaining);
      const paidMinor = leg.fareMinor + leg.baggageMinor;
      return {
        flightNumber: leg.flightNumber,
        daysRemaining,
        refundPercent,
        paidMinor,
        refundMinor: Math.round((paidMinor * refundPercent) / 100),
      };
    });
    return { legs, refundMinor: legs.reduce((sum, leg) => sum + leg.refundMinor, 0), currency: booking.currency };
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
        throw new ConflictException({ message: 'Your payment is still settling. Try again shortly.', code: 'PAYMENT_SETTLING' });
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

  private async expireOne(id: Types.ObjectId, filter: FilterQuery<FlightBooking> = {}) {
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
    await this.notifications.notify(expired.userId, {
      type: NotificationType.BookingExpired,
      title: 'Booking hold expired',
      message: `Booking ${expired.reference} was not paid within ${HOLD_MINUTES} minutes and has expired.`,
      link: this.link(expired),
      data: { bookingId: String(expired._id), reference: expired.reference },
    });
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

  // ---------- called by Person 2 (FLT-05, FLT-06, FLT-29) and Person 6 (ACC-17) ----------

  /**
   * FLT-06: call after a flight is cancelled. Unpaid holds expire; confirmed
   * bookings are cancelled with a full refund, including any other leg.
   * `failed` lists references to run again; calling this twice is safe.
   */
  async cancelForFlight(flightId: string, reason: string) {
    const bookings = await this.activeBookingsOnFlight(flightId);
    const failed: string[] = [];
    let cancelled = 0;
    for (const booking of bookings) {
      if (booking.status === BookingStatus.PendingPayment) {
        await this.expireOne(booking._id);
        continue;
      }
      const done = await this.cancelConfirmed(booking, {
        cancelledBy: 'airline',
        refundMinor: booking.totalMinor,
        reason,
      }).catch((err) => {
        failed.push(booking.reference);
        this.logger.error(`Could not cancel booking ${booking.reference}: ${err.message}`);
        return null;
      });
      if (!done) continue;
      cancelled++;
      await this.notifications.notify(done.userId, {
        type: NotificationType.FlightCancelled,
        title: 'Your flight was cancelled',
        message: `The airline cancelled a flight on booking ${done.reference}. You will receive a full refund.`,
        link: this.link(done),
        data: { bookingId: String(done._id), reference: done.reference, reason },
      });
    }
    return { cancelled, failed };
  }

  /** FLT-05: call after a flight's times change. Refreshes the copies and tells the travellers. */
  async applyScheduleChange(flightId: string) {
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

    await this.notifications.notifyMany(
      bookings.map((b) => b.userId),
      {
        type: NotificationType.FlightScheduleChanged,
        title: 'Your flight schedule changed',
        message: `Flight ${flight.flightNumber} now departs at ` +
          `${utcToLocalIso(flight.departureAt, flight.origin.timezone)} local time.`,
        data: { flightId },
      },
    );
    return { updated: bookings.length };
  }

  private activeBookingsOnFlight(flightId: string) {
    return this.bookingModel
      .find({
        'legs.flightId': new Types.ObjectId(flightId),
        status: { $in: [BookingStatus.PendingPayment, BookingStatus.Confirmed] },
      })
      .exec();
  }

  /** FLT-29: Person 2 calls this for the moderator view and CSV export. */
  listForFlight(user: AuthUser, airlineId: string, flightId: string, query: FlightBookingQueryDto) {
    assertModerates(user, ProviderType.Airline, airlineId, { allowAdmin: true });
    const filter: FilterQuery<FlightBooking> = { 'legs.flightId': new Types.ObjectId(flightId) };
    if (query.status) filter.status = query.status;
    return paginate(this.bookingModel, filter, { ...query, select: STAFF_SAFE_SELECT });
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
