import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { addDays } from '../../../common/utils/time.util';
import {
  AirportInfo,
  CancellationTier,
  FlightInventoryPort,
  FlightSnapshot,
} from '../ports/flight-inventory.port';
import { StubFlight, StubFlightDocument } from './stub-flight.schema';

const CAI: AirportInfo = { iataCode: 'CAI', name: 'Cairo International Airport', cityName: 'Cairo', timezone: 'Africa/Cairo' };
const DXB: AirportInfo = { iataCode: 'DXB', name: 'Dubai International Airport', cityName: 'Dubai', timezone: 'Asia/Dubai' };

const HOUR = 3_600_000;

/**
 * TEMPORARY implementation of FlightInventoryPort until Person 2's module is merged.
 * The seat updates are real and atomic, so booking behaviour can be tested today.
 */
@Injectable()
export class StubFlightInventoryService implements FlightInventoryPort, OnModuleInit {
  private readonly logger = new Logger(StubFlightInventoryService.name);

  constructor(
    @InjectModel(StubFlight.name) private readonly model: Model<StubFlightDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.warn('Using STUB flights. Replace with the real flights module when Person 2 merges.');
  }

  async getFlightForBooking(flightId: string): Promise<FlightSnapshot | null> {
    if (!Types.ObjectId.isValid(flightId)) return null;
    const flight = await this.model.findById(flightId).lean().exec();
    if (!flight) return null;
    return {
      flightId: String(flight._id),
      flightNumber: flight.flightNumber,
      airlineId: String(flight._id),
      airlineName: flight.airlineName,
      origin: flight.origin,
      destination: flight.destination,
      departureAt: flight.departureAt,
      arrivalAt: flight.arrivalAt,
      bookable: flight.bookable,
      currency: this.config.get<string>('platformCurrency'),
      cabins: flight.cabins.map(({ cabinClass, availableSeats, fares }) => ({ cabinClass, availableSeats, fares })),
      baggagePolicy: flight.baggagePolicy,
      cancellationTiers: flight.cancellationTiers,
    };
  }

  /** Moves `count` seats between two counters; the $gte guard is what makes it safe. */
  private async move(
    flightId: string,
    cabinClass: string,
    count: number,
    from: 'availableSeats' | 'heldSeats' | 'bookedSeats',
    to: 'availableSeats' | 'heldSeats' | 'bookedSeats',
    session?: ClientSession,
  ) {
    const res = await this.model
      .updateOne(
        { _id: flightId, cabins: { $elemMatch: { cabinClass, [from]: { $gte: count } } } },
        { $inc: { [`cabins.$.${from}`]: -count, [`cabins.$.${to}`]: count } },
        { session },
      )
      .exec();
    return res.modifiedCount === 1;
  }

  reserveSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession) {
    return this.move(flightId, cabinClass, count, 'availableSeats', 'heldSeats', session);
  }

  releaseSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession) {
    return this.move(flightId, cabinClass, count, 'heldSeats', 'availableSeats', session);
  }

  convertHeldToBooked(flightId: string, cabinClass: string, count: number, session?: ClientSession) {
    return this.move(flightId, cabinClass, count, 'heldSeats', 'bookedSeats', session);
  }

  releaseBookedSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession) {
    return this.move(flightId, cabinClass, count, 'bookedSeats', 'availableSeats', session);
  }

  computeRefundPercent(tiers: CancellationTier[], daysRemaining: number) {
    const tier = [...tiers]
      .sort((a, b) => b.minDaysBeforeDeparture - a.minDaysBeforeDeparture)
      .find((t) => daysRemaining >= t.minDaysBeforeDeparture);
    return tier?.refundPercent ?? 0;
  }

  /** `npm run seed:stub-flights`: a CAI <-> DXB return pair plus a nearly full flight. */
  async seedSample() {
    const cabins = () => [
      { cabinClass: 'economy', availableSeats: 100, fares: { adult: 20000, child: 15000, infant: 2000 } },
      { cabinClass: 'business', availableSeats: 20, fares: { adult: 60000, child: 45000, infant: 6000 } },
    ];
    const policies = {
      baggagePolicy: {
        cabinBagsIncluded: 1,
        checkedBagsIncluded: 1,
        maxExtraBagsPerPassenger: 2,
        extraBagPriceMinor: 3000,
      },
      cancellationTiers: [
        { minDaysBeforeDeparture: 14, refundPercent: 100 },
        { minDaysBeforeDeparture: 7, refundPercent: 50 },
        { minDaysBeforeDeparture: 1, refundPercent: 25 },
      ],
    };
    const outbound = addDays(new Date(), 30);
    const back = addDays(outbound, 7);
    const soon = addDays(new Date(), 3);

    return this.model.insertMany([
      {
        ...policies,
        flightNumber: 'ST100',
        airlineName: 'Stub Air',
        origin: CAI,
        destination: DXB,
        departureAt: outbound,
        arrivalAt: new Date(outbound.getTime() + 4 * HOUR),
        cabins: cabins(),
      },
      {
        ...policies,
        flightNumber: 'ST101',
        airlineName: 'Stub Air',
        origin: DXB,
        destination: CAI,
        departureAt: back,
        arrivalAt: new Date(back.getTime() + 4 * HOUR),
        cabins: cabins(),
      },
      {
        ...policies,
        flightNumber: 'ST200',
        airlineName: 'Stub Air',
        origin: CAI,
        destination: DXB,
        departureAt: soon,
        arrivalAt: new Date(soon.getTime() + 4 * HOUR),
        cabins: [{ cabinClass: 'economy', availableSeats: 2, fares: { adult: 20000, child: 15000, infant: 2000 } }],
      },
    ]);
  }
}
