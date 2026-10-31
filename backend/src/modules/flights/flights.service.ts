import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { BookingStatus, ProviderType, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { assertModerates } from '../../common/utils/access.util';
import { localDayRangeUtc, utcToLocalIso } from '../../common/utils/time.util';
import { escapeRegex, paginate, toPage } from '../../common/utils/paginate';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { MediaService } from '../media/media.service';
import { MediaOwnerType } from '../media/schemas/media.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { BaggagePolicyDto, CabinDto, CancellationPolicyDto, CreateAirlineDto, CreateFlightDto, FlightBookingQueryDto, FlightSearchDto, UpdateAirlineDto, UpdateCabinDto, UpdateFlightDto } from './dto/flights.dto';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { Airline, AirlineDocument, AirlineStatus } from './schemas/airline.schema';
import { Cabin, CabinType, Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { airportLocalToUtc, validateCabin, validateCabins, validateLocalDate } from './flight-validation';
import { validateBaggagePolicy, validateTiers } from './flight-policy';
import { compareOffers, eligibleLeg, flightDetails, FlightOffer } from './flight-search';
import { BOOKING_FIELDS, FlightBookingView } from './schemas/flight-booking-view.schema';
import { bookingCsv } from './booking-csv';
import { FlightHooksService } from './flight-hooks.service';
export { computeRefundPercent } from './flight-policy';

type BookingsRepo = Pick<Model<FlightBookingView>, 'find' | 'countDocuments' | 'distinct' | 'updateMany'>;

/** FLT-03: calendar day of departure at the origin airport, not the UTC day. */
const localDay = (d: Date, timeZone: string) => utcToLocalIso(d, timeZone).slice(0, 10);

export type AirlineProfile = Airline & { _id: Types.ObjectId; logo: Awaited<ReturnType<MediaService['list']>>[number] | null };

/** FLT catalog, scope enforcement and inventory integration boundary for Person 3. */
@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  constructor(
    @InjectModel(Flight.name) private readonly flights: Model<FlightDocument>,
    @InjectModel(Airline.name) private readonly airlines: Model<AirlineDocument>,
    @InjectModel(FlightBookingView.name) private readonly bookings: BookingsRepo,
    private readonly reference: ReferenceDataService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly hooks: FlightHooksService,
  ) {}

  /** Public provider directory using the shared pagination contract. */
  listAirlines(q: PaginationQueryDto) { return paginate(this.airlines, {}, { ...q, sort: { name: 1, _id: 1 } }); }

  /** Public profile with shared media representation. */
  async airlineDetails(id: string): Promise<AirlineProfile> {
    const airline = await this.airlines.findById(id).lean().exec();
    if (!airline) throw new NotFoundException('Airline not found');
    const images = await this.media.list(MediaOwnerType.AirlineLogo, id);
    return { ...airline, logo: images[0] ?? null };
  }

  /** Explicit removal permits replacement without deleting a valid logo on a failed upload. */
  async removeLogo(user: AuthUser, id: string) {
    assertModerates(user, ProviderType.Airline, id);
    if (!await this.airlines.findById(id).exec()) throw new NotFoundException('Airline not found');
    return this.media.removeAllFor(MediaOwnerType.AirlineLogo, id);
  }

  /** FLT-29: provider scope is verified before querying any booking records. */
  async listBookings(user: AuthUser, id: string, q: FlightBookingQueryDto) {
    const filter = await this.bookingFilter(user, id, q);
    return paginate(this.bookings as Model<FlightBookingView>, filter, { ...q, select: BOOKING_FIELDS, sort: { createdAt: -1, _id: -1 } });
  }

  /** Same scope/filter as the list; exports up to 5,000 matches with the FLT-29 contract projection. */
  async bookingsCsv(user: AuthUser, id: string, q: FlightBookingQueryDto) {
    const filter = await this.bookingFilter(user, id, q);
    const rows = await this.bookings.find(filter).select(BOOKING_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(5000).lean().exec();
    return bookingCsv(rows);
  }

  private async bookingFilter(user: AuthUser, id: string, q: FlightBookingQueryDto) {
    await this.scopedFlight(user, id);
    if (q.from) validateLocalDate(q.from);
    if (q.to) validateLocalDate(q.to);
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Invalid booking date range');
    const filter: Record<string, any> = { flightId: new Types.ObjectId(id) };
    if (q.status) filter.status = q.status;
    if (q.cabin) filter.cabin = q.cabin;
    if (q.reference) filter.reference = new RegExp(escapeRegex(q.reference), 'i');
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = localDayRangeUtc(q.from, 'UTC').start;
      if (q.to) filter.createdAt.$lt = localDayRangeUtc(q.to, 'UTC').end;
    }
    return filter;
  }

  /** FLT-17: current public inventory and each airport's local time, even between cron ticks. */
  async details(id: string) {
    const flight = await this.flights.findById(id).lean().exec();
    if (!flight) throw new NotFoundException('Flight not found');
    const airline = await this.airlines.findById(flight.airlineId).lean().exec();
    return flightDetails({ ...flight, airline: airline ?? undefined });
  }

  /** FLT-11/15: local-day direct flights; round trips are chronological pairs, paginated after sorting. */
  async search(q: FlightSearchDto) {
    validateLocalDate(q.departureDate);
    if (q.returnDate) validateLocalDate(q.returnDate);
    const adults = q.adults ?? 1, children = q.children ?? 0, infants = q.infants ?? 0;
    const seats = adults + children;
    if (![adults, children, infants].every(Number.isSafeInteger) || adults < 1 || children < 0 || infants < 0 || infants > adults || seats > 9) {
      throw new BadRequestException('Require 1+ adults, at most 9 seated passengers and one lap infant per adult');
    }
    if ((q.returnDate && q.returnDate < q.departureDate) || (q.minPrice ?? 0) > (q.maxPrice ?? Infinity)) {
      throw new BadRequestException('Invalid date or price range');
    }
    const [origin, destination] = await Promise.all([this.reference.resolveAirport(q.origin), this.reference.resolveAirport(q.destination)]);
    if (String(origin._id) === String(destination._id)) throw new BadRequestException('Airports must differ');
    const now = new Date();
    // FLT-11: only Scheduled flights of active airlines are searchable.
    const activeAirlines = await this.airlines.find({ status: AirlineStatus.Active }).lean().exec();
    const airlineById = new Map(activeAirlines.map((a) => [String(a._id), a]));
    const legs = async (from: typeof origin, to: typeof origin, day: string) => {
      const range = localDayRangeUtc(day, from.timezone);
      const flights = await this.flights.find({ origin: from.iataCode, destination: to.iataCode,
        airlineId: { $in: [...airlineById.values()].map((a) => a._id) },
        status: FlightStatus.Scheduled, departureAt: { $gte: range.start, $lt: range.end, $gt: now },
      }).limit(500).lean().exec();
      return flights.filter((f) => airlineById.has(String(f.airlineId)))
        .map((f) => eligibleLeg({ ...f, airline: airlineById.get(String(f.airlineId)) }, q, seats))
        .filter((f): f is NonNullable<typeof f> => !!f);
    };
    const outbound = await legs(origin, destination, q.departureDate);
    const inbound = q.returnDate ? await legs(destination, origin, q.returnDate) : undefined;
    const offers: FlightOffer[] = [];
    for (const out of outbound) {
      for (const back of inbound ?? [undefined]) {
        if (back && back.departureAt <= out.arrivalAt) continue;
        const combinations = out.cabins.flatMap((outCabin) => (back?.cabins ?? [undefined]).map((backCabin) => ({
          outCabin, backCabin, price: outCabin.price + (backCabin?.price ?? 0),
        }))).filter((c) => c.price >= (q.minPrice ?? 0) && c.price <= (q.maxPrice ?? Infinity))
          .sort((a, b) => a.price - b.price || a.outCabin.cabin.localeCompare(b.outCabin.cabin) ||
            (a.backCabin?.cabin ?? '').localeCompare(b.backCabin?.cabin ?? ''));
        const best = combinations[0];
        if (!best) continue;
        const price = best.price;
        const totalPrice = price * seats + price * infants * 0.1;
        offers.push({ outbound: { ...out, cabins: [best.outCabin] }, ...(back ? { inbound: { ...back, cabins: [best.backCabin] } } : {}), price, totalPrice,
          durationMinutes: out.durationMinutes + (back?.durationMinutes ?? 0) });
      }
    }
    offers.sort((a, b) => compareOffers(a, b, q.sort));
    const page = Math.max(1, q.page ?? 1), limit = Math.min(100, Math.max(1, q.limit ?? 10));
    return toPage(offers.slice((page - 1) * limit, page * limit), offers.length, page, limit);
  }

  /** FLT-08: replace the airline-level baggage policy (assigned moderator only). */
  async setBaggagePolicy(user: AuthUser, id: string, dto: BaggagePolicyDto) {
    assertModerates(user, ProviderType.Airline, id);
    validateBaggagePolicy(dto);
    return this.savePolicy(id, { baggagePolicy: dto });
  }

  /** FLT-09: replace the airline-level cancellation tiers (assigned moderator only). */
  async setCancellationPolicy(user: AuthUser, id: string, dto: CancellationPolicyDto) {
    assertModerates(user, ProviderType.Airline, id);
    validateTiers(dto.tiers);
    return this.savePolicy(id, { cancellationTiers: [...dto.tiers].sort((a, b) => a.minDays - b.minDays) });
  }

  private async savePolicy(id: string, set: Record<string, unknown>) {
    const airline = await this.airlines.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).exec();
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  /**
   * FLT-05: edit times, cabin price/capacity and (only while the flight has no bookings) airports.
   * flightNumber, airlineId and currency are immutable. Existing bookings keep their paid price.
   */
  async updateFlight(user: AuthUser, id: string, dto: UpdateFlightDto) {
    const old = await this.scopedFlight(user, id);
    this.assertEditable(old);
    const [origin, destination] = await Promise.all([
      this.reference.resolveAirport(dto.origin ?? old.origin), this.reference.resolveAirport(dto.destination ?? old.destination),
    ]);
    if (String(origin._id) === String(destination._id)) throw new BadRequestException('Airports must differ');
    if (origin.iataCode !== old.origin || destination.iataCode !== old.destination) {
      if (await this.bookings.countDocuments({ flightId: new Types.ObjectId(id) }).exec() > 0) {
        throw new ConflictException('Airports cannot change once the flight has bookings');
      }
    }
    const departureAt = dto.departureLocal ? airportLocalToUtc(dto.departureLocal, origin.timezone) : old.departureAt;
    const arrivalAt = dto.arrivalLocal ? airportLocalToUtc(dto.arrivalLocal, destination.timezone) : old.arrivalAt;
    if (departureAt.getTime() <= Date.now() || arrivalAt <= departureAt) throw new BadRequestException('Departure must be future and arrival later');
    const cabins = old.cabins.map((c) => ({ ...c }));
    for (const change of dto.cabins ?? []) {
      const cabin = cabins.find((c) => c.cabin === change.cabin);
      if (!cabin) throw new BadRequestException(`Cabin ${change.cabin} not on this flight; add it with POST /flights/:id/cabins`);
      Object.assign(cabin, { capacity: change.capacity ?? cabin.capacity, price: change.price ?? cabin.price });
      validateCabin(cabin);
      if (cabin.held + cabin.booked > cabin.capacity) throw new ConflictException('Capacity is below seats already booked or held');
    }
    const departureDay = localDay(departureAt, origin.timezone);
    await this.assertNoDuplicate(old.airlineId, old.flightNumber, departureDay, id);
    const set = { origin: origin.iataCode, destination: destination.iataCode, originTimezone: origin.timezone, destinationTimezone: destination.timezone,
      departureAt, departureDay, arrivalAt, cabins };
    const updated = await this.guardedFlightUpdate({ _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, __v: old.__v, cabins: old.cabins }, { $set: set, $inc: { __v: 1 } });
    if (old.departureAt.getTime() !== departureAt.getTime() || old.arrivalAt.getTime() !== arrivalAt.getTime()) {
      await this.notifyPassengers(id, NotificationType.FlightScheduleChanged, [BookingStatus.Confirmed]);
    }
    return updated;
  }

  /** FLT-04: add a cabin class to a scheduled flight; each class at most once. */
  async addCabin(user: AuthUser, id: string, dto: CabinDto) {
    const old = await this.scopedFlight(user, id);
    this.assertEditable(old);
    validateCabin(dto);
    if (old.cabins.some((c) => c.cabin === dto.cabin)) throw new ConflictException('Cabin class already on this flight');
    return this.guardedFlightUpdate(
      { _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, 'cabins.cabin': { $ne: dto.cabin } },
      { $push: { cabins: { cabin: dto.cabin, capacity: dto.capacity, price: dto.price, held: 0, booked: 0 } } },
    );
  }

  /** FLT-04/05: change one cabin's price or capacity. Capacity may not drop below booked + held. */
  async updateCabin(user: AuthUser, id: string, cabinId: string, dto: UpdateCabinDto) {
    const old = await this.scopedFlight(user, id);
    this.assertEditable(old);
    const cabin = old.cabins.find((c) => String(c._id) === cabinId);
    if (!cabin) throw new NotFoundException('Cabin not found');
    const next = { ...cabin, capacity: dto.capacity ?? cabin.capacity, price: dto.price ?? cabin.price };
    validateCabin(next);
    if (cabin.held + cabin.booked > next.capacity) throw new ConflictException('Capacity is below seats already booked or held');
    return this.guardedFlightUpdate(
      { _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, cabins: old.cabins },
      { $set: { 'cabins.$[c].capacity': next.capacity, 'cabins.$[c].price': next.price } },
      { arrayFilters: [{ 'c._id': cabin._id }] },
    );
  }

  private async guardedFlightUpdate(filter: Record<string, any>, update: Record<string, any>, options: Record<string, any> = {}) {
    try {
      const updated = await this.flights.findOneAndUpdate(filter, update, { new: true, runValidators: true, ...options }).exec();
      if (!updated) throw new ConflictException('Flight changed; reload and retry');
      return updated;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Duplicate flight number on that departure date');
      throw error;
    }
  }

  /** FLT-03: one flight number per airline per departure calendar day at the origin airport (local). */
  private async assertNoDuplicate(airlineId: unknown, flightNumber: string, departureDay: string, exceptId?: string) {
    const filter: Record<string, unknown> = { airlineId, flightNumber, departureDay };
    if (exceptId) filter._id = { $ne: exceptId };
    if (await this.flights.exists(filter).exec()) throw new ConflictException('Duplicate flight number on that departure date');
  }

  /**
   * FLT-06: cancel a scheduled future flight. Zeroes held seats, cancels Confirmed bookings with a
   * 100% refund marker (PAY-03), expires PendingPayment bookings, notifies every passenger, then
   * runs handlers registered via FlightHooksService so Person 3 can execute the refunds.
   * Idempotent: repeating the call on an already-cancelled flight only re-delivers unfinished handoffs.
   */
  async cancelFlight(user: AuthUser, id: string) {
    const old = await this.scopedFlight(user, id);
    if (old.status === FlightStatus.Cancelled) return { flight: old, ...await this.cancelFlightBookings(id) };
    this.assertEditable(old);
    const flight = await this.guardedFlightUpdate(
      { _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, __v: old.__v },
      { $set: { status: FlightStatus.Cancelled, 'cabins.$[].held': 0 }, $inc: { __v: 1 } },
    );
    return { flight, ...await this.cancelFlightBookings(id) };
  }

  /**
   * FLT-06 handoff. Conditional updates flag exactly the rows they transition with handoffPending, so the event
   * only carries bookings this workflow committed (a booking completed concurrently is never refunded). Rows stay
   * flagged until all handlers succeed; a failure throws 503 and a retry re-delivers them without re-transitioning.
   */
  async cancelFlightBookings(flightId: string) {
    const target = { flightId: new Types.ObjectId(flightId) };
    const flag = { handoffPending: true };
    const [cancelled, expired] = await Promise.all([
      this.bookings.updateMany({ ...target, status: BookingStatus.Confirmed }, { $set: { status: BookingStatus.Cancelled, refundPercent: 100, ...flag } }).exec(),
      this.bookings.updateMany({ ...target, status: BookingStatus.PendingPayment }, { $set: { status: BookingStatus.Expired, ...flag } }).exec(),
    ]);
    const rows = await this.bookings.find({ ...target, ...flag, status: { $in: [BookingStatus.Cancelled, BookingStatus.Expired] } }).select('_id userId status').lean().exec();
    const idsOf = (status: BookingStatus) => rows.filter((r) => r.status === status).map((r) => String(r._id));
    const cancelledIds = idsOf(BookingStatus.Cancelled), expiredIds = idsOf(BookingStatus.Expired);
    // Notify only on the pass that actually flipped rows, so retries do not spam passengers.
    if ((cancelled?.modifiedCount ?? 0) + (expired?.modifiedCount ?? 0) > 0) {
      await this.notifications.notifyMany(rows.map((b) => b.userId).filter((u): u is Types.ObjectId => !!u), {
        type: NotificationType.FlightCancelled, title: 'Flight cancelled',
        message: 'Your flight was cancelled by the airline. Confirmed bookings are refunded in full.', link: `/flights/${flightId}`, data: { flightId },
      });
    }
    if (rows.length) {
      try {
        await this.hooks.runCancellation({ flightId, cancelledBookingIds: cancelledIds, expiredBookingIds: expiredIds, refundPercent: 100 });
      } catch (error) {
        this.logger.error(`Flight ${flightId} cancelled but refund handoff incomplete: ${(error as Error).message}`);
        throw new ServiceUnavailableException('Flight cancelled but refund handoff failed; repeat the cancel request to retry');
      }
      await this.bookings.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { handoffPending: false } }).exec();
    }
    return { cancelledBookings: cancelledIds.length, expiredBookings: expiredIds.length };
  }

  private async scopedFlight(user: AuthUser, id: string) {
    const flight = await this.flights.findById(id).lean().exec();
    if (!flight) throw new NotFoundException('Flight not found');
    assertModerates(user, ProviderType.Airline, flight.airlineId);
    return flight;
  }

  private assertEditable(flight: Flight) {
    if (flight.status !== FlightStatus.Scheduled || flight.departureAt.getTime() <= Date.now()) {
      throw new ConflictException('Only scheduled future flights can be edited or cancelled');
    }
  }

  private async notifyPassengers(id: string, type: NotificationType, statuses: BookingStatus[]) {
    const users = await this.bookings.distinct('userId', { flightId: id, status: { $in: statuses } }).exec();
    await this.notifications.notifyMany(users, {
      type, title: 'Flight schedule changed',
      message: 'Please review your flight booking for the latest flight information.', link: `/flights/${id}`, data: { flightId: id },
    });
  }

  /** Create a future flight under the caller's assigned airline with zero inventory usage. */
  async createFlight(user: AuthUser, dto: CreateFlightDto) {
    assertModerates(user, ProviderType.Airline, dto.airlineId);
    const airline = await this.airlines.findById(dto.airlineId).exec();
    if (!airline) throw new NotFoundException('Airline not found');
    validateCabins(dto.cabins);
    const [origin, destination] = await Promise.all([
      this.reference.resolveAirport(dto.origin), this.reference.resolveAirport(dto.destination),
    ]);
    if (String(origin._id) === String(destination._id)) throw new BadRequestException('Airports must differ');
    await this.reference.assertSupportedCurrency(dto.currency);
    if (dto.currency !== this.config.get<string>('platformCurrency')) throw new BadRequestException('Use platform currency');
    const departureAt = airportLocalToUtc(dto.departureLocal, origin.timezone);
    const arrivalAt = airportLocalToUtc(dto.arrivalLocal, destination.timezone);
    if (departureAt.getTime() <= Date.now() || arrivalAt <= departureAt) throw new BadRequestException('Departure must be future and arrival later');
    const departureDay = localDay(departureAt, origin.timezone);
    await this.assertNoDuplicate(dto.airlineId, dto.flightNumber, departureDay);
    try {
      return await this.flights.create({
        airlineId: dto.airlineId, flightNumber: dto.flightNumber, origin: origin.iataCode, destination: destination.iataCode,
        originTimezone: origin.timezone, destinationTimezone: destination.timezone, departureAt, departureDay, arrivalAt, currency: dto.currency,
        cabins: dto.cabins.map((c) => ({ ...c, held: 0, booked: 0 })), status: FlightStatus.Scheduled,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Duplicate flight number on that departure date');
      throw error;
    }
  }

  /**
   * Person 3: one conditional increment of held seats for a scheduled, future flight.
   * All requested seats must fit in this cabin. Returns false on missing flight/cabin,
   * stale lifecycle or insufficient availability; invalid cabin/count throws 400.
   * These counter methods are not booking-idempotent: callers must coordinate retries
   * with their booking state and must never apply the same hold/conversion twice.
   */
  reserveSeats(id: string, cabin: CabinType, count: number) { return this.inventory(id, cabin, count, 'reserve'); }
  /** Person 3: atomically subtract held seats even after cancellation/departure; false if too few held. */
  releaseSeats(id: string, cabin: CabinType, count: number) { return this.inventory(id, cabin, count, 'release'); }
  /** Person 3 (FLT-26): atomically return booked seats after a user cancellation; false if fewer than count booked. */
  releaseBookedSeats(id: string, cabin: CabinType, count: number) { return this.inventory(id, cabin, count, 'releaseBooked'); }
  /** Person 3: atomically move held seats to booked; false if insufficient held or no longer bookable. */
  convertHeldToBooked(id: string, cabin: CabinType, count: number) { return this.inventory(id, cabin, count, 'convert'); }

  private async inventory(id: string, cabin: CabinType, count: number, action: 'reserve' | 'release' | 'convert' | 'releaseBooked') {
    if (!Number.isSafeInteger(count) || count <= 0 || !Object.values(CabinType).includes(cabin)) {
      throw new BadRequestException('Positive integer seat count and valid cabin required');
    }
    const filter: Record<string, any> = { _id: id };
    if (action !== 'release' && action !== 'releaseBooked') Object.assign(filter, { status: FlightStatus.Scheduled, departureAt: { $gt: new Date() } });
    if (action === 'reserve') {
      filter.$expr = { $anyElementTrue: [{ $map: { input: '$cabins', as: 'c', in: { $and: [
        { $eq: ['$$c.cabin', cabin] },
        { $gte: [{ $subtract: ['$$c.capacity', { $add: ['$$c.booked', '$$c.held'] }] }, count] },
      ] } } }] };
    } else if (action === 'releaseBooked') filter.cabins = { $elemMatch: { cabin, booked: { $gte: count } } };
    else filter.cabins = { $elemMatch: { cabin, held: { $gte: count } } };
    const increment: Record<string, number> = action === 'releaseBooked' ? { 'cabins.$[c].booked': -count }
      : { 'cabins.$[c].held': action === 'reserve' ? count : -count };
    if (action === 'convert') increment['cabins.$[c].booked'] = count;
    const result = await this.flights.updateOne(filter, { $inc: increment }, { arrayFilters: [{ 'c.cabin': cabin }] }).exec();
    return result.modifiedCount === 1;
  }

  /** FLT-30: idempotent minute sweep; two ordered updates catch up after downtime. */
  @Cron('0 * * * * *')
  async advanceStatuses(now = new Date()) {
    await this.flights.updateMany({ status: FlightStatus.Scheduled, departureAt: { $lte: now } }, { $set: { status: FlightStatus.Departed } }).exec();
    await this.flights.updateMany({ status: FlightStatus.Departed, arrivalAt: { $lte: now } }, { $set: { status: FlightStatus.Completed } }).exec();
  }

  /** Admin only even when called outside HTTP. Country must exist in reference data. */
  async createAirline(user: AuthUser, dto: CreateAirlineDto) {
    if (user?.role !== Role.Admin) throw new ForbiddenException('Admin role required');
    await this.reference.assertCountryCodes([dto.countryCode]);
    const airline = await this.airlines.create(dto);
    await this.audit.log(user, { action: AuditAction.ProviderCreated, targetType: 'airline', targetId: airline._id });
    return airline;
  }

  /** Only the assigned moderator may edit a provider. */
  async updateAirline(user: AuthUser, id: string, dto: UpdateAirlineDto) {
    assertModerates(user, ProviderType.Airline, id);
    if (dto.countryCode) await this.reference.assertCountryCodes([dto.countryCode]);
    const airline = await this.airlines.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).exec();
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  /** Shared media validates bytes and enforces the one-logo limit. Remove the old logo before replacement. */
  async uploadLogo(user: AuthUser, id: string, file: Express.Multer.File) {
    assertModerates(user, ProviderType.Airline, id);
    if (!file) throw new BadRequestException('Upload an image in the image field');
    if (!await this.airlines.findById(id).exec()) throw new NotFoundException('Airline not found');
    return this.media.saveImages({ files: [file], ownerType: MediaOwnerType.AirlineLogo, ownerId: id, uploadedBy: user.id });
  }
}
