import { ClientSession } from 'mongoose';
import { CancellationTier } from '../../../common/utils/cancellation-tiers';
import { CabinType } from '../../flights/schemas/flight.schema';

export type { CancellationTier };

/**
 * Everything flight booking needs from the flights module, in the shape bookings
 * store: money in integer minor units (what Stripe charges), fares per passenger
 * type, and the baggage rules of the chosen cabin. FlightsInventoryAdapter maps
 * Person 2's FlightsService onto it.
 */
export const FLIGHT_INVENTORY = Symbol('FLIGHT_INVENTORY');

export enum PassengerType {
  Adult = 'adult',
  Child = 'child',
  Infant = 'infant',
}

export interface AirportInfo {
  iataCode: string;
  name: string;
  cityName: string;
  timezone: string; // IANA, used for GEN-06 local times
}

/** FLT-04 / FLT-08, resolved for one cabin. Extra bags have the same max weight as free ones. */
export interface BaggagePolicy {
  freeBags: number;
  maxWeightKg: number | null;
  maxExtraBagsPerPassenger: number;
  /** Per extra bag, per passenger, per flight. */
  extraBagPriceMinor: number;
}

export interface CabinOffer {
  cabinClass: CabinType;
  availableSeats: number;
  /** FLT-12: adults and children pay the cabin fare, infants 10% of it. Integer minor units. */
  fares: Record<PassengerType, number>;
  baggagePolicy: BaggagePolicy;
}

export interface FlightSnapshot {
  flightId: string;
  flightNumber: string;
  airlineId: string;
  airlineName: string;
  origin: AirportInfo;
  destination: AirportInfo;
  departureAt: Date; // UTC
  arrivalAt: Date; // UTC
  /** False once the flight is cancelled, departed, or its airline is inactive. */
  bookable: boolean;
  currency: string;
  cabins: CabinOffer[];
  /** FLT-09: { minDays, refundPercent } tiers, as accepted at payment (PAY-02). */
  cancellationTiers: CancellationTier[];
}

/**
 * Seat methods must be atomic, a single conditional update, and must use `session`
 * when given: booking status and seat counters commit together.
 */
export interface FlightInventoryPort {
  getFlightForBooking(flightId: string): Promise<FlightSnapshot | null>;

  /** available -> held. Resolves false, changing nothing, when too few seats are left. */
  reserveSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession): Promise<boolean>;

  /** held -> available (hold expired or flight cancelled). */
  releaseSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession): Promise<boolean>;

  /** held -> booked (payment confirmed). False if the flight is no longer bookable. */
  convertHeldToBooked(
    flightId: string,
    cabinClass: CabinType,
    count: number,
    session?: ClientSession,
  ): Promise<boolean>;

  /** booked -> available (confirmed booking cancelled). */
  releaseBookedSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession): Promise<boolean>;

  computeRefundPercent(tiers: CancellationTier[], daysRemaining: number): number;
}
