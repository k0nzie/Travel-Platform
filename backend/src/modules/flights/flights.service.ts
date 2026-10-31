import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CreateAirlineDto, CreateFlightDto, FlightBookingQueryDto, FlightSearchDto, UpdateAirlineDto, UpdateFlightDto } from './dto/flights.dto';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { Airline, AirlineDocument } from './schemas/airline.schema';
import { CabinType, Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { airportLocalToUtc, validateCabins, validateLocalDate } from './flight-validation';
import { validateTiers } from './flight-policy';
import { compareOffers, eligibleLeg, flightDetails, FlightOffer } from './flight-search';
import { BOOKING_FIELDS, FlightBookingView } from './schemas/flight-booking-view.schema';
import { bookingCsv } from './booking-csv';
export { computeRefundPercent } from './flight-policy';

export type AirlineProfile = Airline & { _id: Types.ObjectId; logo: Awaited<ReturnType<MediaService['list']>>[number] | null };

/** FLT catalog, scope enforcement and inventory integration boundary for Person 3. */
@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name) private readonly flights: Model<FlightDocument>,
    @InjectModel(Airline.name) private readonly airlines: Model<AirlineDocument>,
    @InjectModel(FlightBookingView.name) private readonly bookings: Pick<Model<FlightBookingView>, 'find' | 'countDocuments' | 'distinct'>,
    private readonly reference: ReferenceDataService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
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
    const legs = async (from: typeof origin, to: typeof origin, day: string) => {
      const range = localDayRangeUtc(day, from.timezone);
      const flights = await this.flights.find({ origin: from.iataCode, destination: to.iataCode,
        status: FlightStatus.Scheduled, departureAt: { $gte: range.start, $lt: range.end, $gt: now },
      }).limit(500).lean().exec();
      return flights.map((f) => eligibleLeg(f, q, seats)).filter((f): f is NonNullable<typeof f> => !!f);
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
        offers.push({ outbound: { ...out, cabins: [best.outCabin] }, ...(back ? { inbound: { ...back, cabins: [best.backCabin] } } : {}), price, totalPrice: price * seats,
          durationMinutes: out.durationMinutes + (back?.durationMinutes ?? 0) });
      }
    }
    offers.sort((a, b) => compareOffers(a, b, q.sort));
    const page = Math.max(1, q.page ?? 1), limit = Math.min(100, Math.max(1, q.limit ?? 10));
    return toPage(offers.slice((page - 1) * limit, page * limit), offers.length, page, limit);
  }

  /** FLT-05: preserve inventory and reject a concurrent edit, hold, or lifecycle transition. */
  async updateFlight(user: AuthUser, id: string, dto: UpdateFlightDto) {
    const old = await this.scopedFlight(user, id);
    this.assertEditable(old);
    const input: CreateFlightDto = {
      ...old, airlineId: String(old.airlineId),
      departureLocal: utcToLocalIso(old.departureAt, old.originTimezone).slice(0, 16),
      arrivalLocal: utcToLocalIso(old.arrivalAt, old.destinationTimezone).slice(0, 16), ...dto,
    };
    const data = await this.flightData(input);
    for (const cabin of old.cabins) {
      const replacement = data.cabins.find((c) => c.cabin === cabin.cabin);
      if (cabin.held + cabin.booked > (replacement?.capacity ?? 0)) throw new ConflictException('Capacity is below occupied inventory');
      if (replacement) Object.assign(replacement, { held: cabin.held, booked: cabin.booked });
    }
    const updated = await this.flights.findOneAndUpdate(
      { _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, __v: old.__v, cabins: old.cabins },
      { $set: data, $inc: { __v: 1 } }, { new: true, runValidators: true },
    ).exec();
    if (!updated) throw new ConflictException('Flight changed; reload and retry');
    if (old.departureAt.getTime() !== data.departureAt.getTime() || old.arrivalAt.getTime() !== data.arrivalAt.getTime() ||
        old.origin !== data.origin || old.destination !== data.destination) {
      await this.notifyPassengers(id, NotificationType.FlightScheduleChanged);
    }
    return updated;
  }

  /** FLT-06: terminal cancellation; booking refunds are owned by Person 3. */
  async cancelFlight(user: AuthUser, id: string) {
    const old = await this.scopedFlight(user, id);
    this.assertEditable(old);
    const updated = await this.flights.findOneAndUpdate(
      { _id: id, airlineId: old.airlineId, status: FlightStatus.Scheduled, departureAt: { $gt: new Date() }, __v: old.__v },
      { $set: { status: FlightStatus.Cancelled }, $inc: { __v: 1 } }, { new: true },
    ).exec();
    if (!updated) throw new ConflictException('Flight changed; reload and retry');
    await this.notifyPassengers(id, NotificationType.FlightCancelled);
    return updated;
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

  private async notifyPassengers(id: string, type: NotificationType) {
    const users = await this.bookings.distinct('userId', { flightId: id, status: { $in: [BookingStatus.PendingPayment, BookingStatus.Confirmed] } }).exec();
    await this.notifications.notifyMany(users, {
      type, title: type === NotificationType.FlightCancelled ? 'Flight cancelled' : 'Flight schedule changed',
      message: 'Please review your flight booking for the latest flight information.', link: `/flights/${id}`, data: { flightId: id },
    });
  }

  /** Create a future flight under the caller's assigned airline with zero inventory usage. */
  async createFlight(user: AuthUser, dto: CreateFlightDto) {
    assertModerates(user, ProviderType.Airline, dto.airlineId);
    if (!await this.airlines.findById(dto.airlineId).exec()) throw new NotFoundException('Airline not found');
    const data = await this.flightData(dto);
    return this.flights.create({ ...data, airlineId: dto.airlineId, status: FlightStatus.Scheduled });
  }

  private async flightData(dto: CreateFlightDto) {
    validateCabins(dto.cabins);
    validateTiers(dto.cancellationTiers);
    const [origin, destination] = await Promise.all([
      this.reference.resolveAirport(dto.origin), this.reference.resolveAirport(dto.destination),
    ]);
    if (String(origin._id) === String(destination._id)) throw new BadRequestException('Airports must differ');
    await this.reference.assertSupportedCurrency(dto.currency);
    if (dto.currency !== this.config.get<string>('platformCurrency')) throw new BadRequestException('Use platform currency');
    const departureAt = airportLocalToUtc(dto.departureLocal, origin.timezone);
    const arrivalAt = airportLocalToUtc(dto.arrivalLocal, destination.timezone);
    if (departureAt.getTime() <= Date.now() || arrivalAt <= departureAt) throw new BadRequestException('Departure must be future and arrival later');
    return {
      flightNumber: dto.flightNumber, origin: origin.iataCode, destination: destination.iataCode,
      originTimezone: origin.timezone, destinationTimezone: destination.timezone,
      departureAt, arrivalAt, currency: dto.currency,
      cabins: dto.cabins.map((c) => ({ ...c, held: 0, booked: 0 })),
      baggagePolicy: dto.baggagePolicy, cancellationTiers: dto.cancellationTiers,
    };
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
  /** Person 3: atomically move held seats to booked; false if insufficient held or no longer bookable. */
  convertHeldToBooked(id: string, cabin: CabinType, count: number) { return this.inventory(id, cabin, count, 'convert'); }

  private async inventory(id: string, cabin: CabinType, count: number, action: 'reserve' | 'release' | 'convert') {
    if (!Number.isSafeInteger(count) || count <= 0 || !Object.values(CabinType).includes(cabin)) {
      throw new BadRequestException('Positive integer seat count and valid cabin required');
    }
    const filter: Record<string, any> = { _id: id };
    if (action !== 'release') Object.assign(filter, { status: FlightStatus.Scheduled, departureAt: { $gt: new Date() } });
    if (action === 'reserve') {
      filter.$expr = { $anyElementTrue: [{ $map: { input: '$cabins', as: 'c', in: { $and: [
        { $eq: ['$$c.cabin', cabin] },
        { $gte: [{ $subtract: ['$$c.capacity', { $add: ['$$c.booked', '$$c.held'] }] }, count] },
      ] } } }] };
    } else filter.cabins = { $elemMatch: { cabin, held: { $gte: count } } };
    const increment: Record<string, number> = { 'cabins.$[c].held': action === 'reserve' ? count : -count };
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
