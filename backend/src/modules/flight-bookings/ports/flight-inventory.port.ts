import { ClientSession } from 'mongoose';

/**
 * Everything flight booking needs from Person 2's flights module. Bookings only
 * ever use this interface, so P2's real service replaces the stub with one line
 * in flight-bookings.module.ts (see docs/P3_BOOKING_PAYMENTS.md).
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

/** FLT-09: refund percent once at least `minDaysBeforeDeparture` days remain. */
export interface CancellationTier {
  minDaysBeforeDeparture: number;
  refundPercent: number;
}

/** FLT-08 */
export interface BaggagePolicy {
  cabinBagsIncluded: number;
  checkedBagsIncluded: number;
  maxExtraBagsPerPassenger: number;
  /** Per extra bag, per passenger, per flight. */
  extraBagPriceMinor: number;
}

export interface CabinOffer {
  cabinClass: string;
  availableSeats: number;
  /** Fare per passenger type, in integer minor units of the platform currency. */
  fares: Record<PassengerType, number>;
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
  /** False once the flight is cancelled, departed or otherwise closed for sale. */
  bookable: boolean;
  currency: string;
  cabins: CabinOffer[];
  baggagePolicy: BaggagePolicy;
  cancellationTiers: CancellationTier[];
}

/**
 * Seat methods must be atomic, a single conditional update, and must use `session`
 * when given: booking status and seat counters commit together.
 */
export interface FlightInventoryPort {
  getFlightForBooking(flightId: string): Promise<FlightSnapshot | null>;

  /** available -> held. Resolves false, changing nothing, when too few seats are left. */
  reserveSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession): Promise<boolean>;

  /** held -> available (hold expired). */
  releaseSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession): Promise<boolean>;

  /** held -> booked (payment confirmed). */
  convertHeldToBooked(flightId: string, cabinClass: string, count: number, session?: ClientSession): Promise<boolean>;

  /** booked -> available (confirmed booking cancelled). */
  releaseBookedSeats(flightId: string, cabinClass: string, count: number, session?: ClientSession): Promise<boolean>;

  computeRefundPercent(tiers: CancellationTier[], daysRemaining: number): number;
}
