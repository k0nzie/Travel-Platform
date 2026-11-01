import { Flight, FlightStatus } from './schemas/flight.schema';
import { utcToLocalIso } from '../../common/utils/time.util';
import { FlightSearchDto, FlightSort } from './dto/flights.dto';

/** Public projection deliberately excludes persistence/version metadata. */
export function flightDetails(flight: Flight & { _id: unknown; airline?: unknown }, now = new Date()) {
  const status = flight.status === FlightStatus.Scheduled && flight.departureAt <= now
    ? (flight.arrivalAt <= now ? FlightStatus.Completed : FlightStatus.Departed)
    : flight.status === FlightStatus.Departed && flight.arrivalAt <= now ? FlightStatus.Completed : flight.status;
  return {
    id: String(flight._id), airlineId: String(flight.airlineId),
    airline: (flight as any).airline ? {
      id: String((flight as any).airline._id ?? (flight as any).airline.id ?? flight.airlineId),
      name: (flight as any).airline.name,
      code: (flight as any).airline.code,
      countryCode: (flight as any).airline.countryCode,
      status: (flight as any).airline.status,
    } : undefined,
    flightNumber: flight.flightNumber,
    origin: flight.origin, destination: flight.destination, status,
    departureAt: flight.departureAt, arrivalAt: flight.arrivalAt,
    departureLocal: utcToLocalIso(flight.departureAt, flight.originTimezone),
    arrivalLocal: utcToLocalIso(flight.arrivalAt, flight.destinationTimezone),
    originTimezone: flight.originTimezone, destinationTimezone: flight.destinationTimezone,
    durationMinutes: (flight.arrivalAt.getTime() - flight.departureAt.getTime()) / 60000,
    currency: flight.currency,
    // FLT-08/09: policies are airline-level; flights expose their airline's current policy.
    baggagePolicy: (flight as any).airline?.baggagePolicy ?? null, cancellationTiers: (flight as any).airline?.cancellationTiers ?? [],
    cabins: flight.cabins.map((c) => ({ ...c, available: status === FlightStatus.Scheduled ? Math.max(0, c.capacity - c.held - c.booked) : 0 })),
  };
}
export type FlightDetails = ReturnType<typeof flightDetails>;
export interface FlightOffer { outbound: FlightDetails; inbound?: FlightDetails; price: number; totalPrice: number; durationMinutes: number }

/** Filter before choosing the cheapest cabin so an unrelated cheap/full cabin cannot affect fares. */
export function eligibleLeg(flight: Flight & { _id: unknown; airline?: unknown }, query: FlightSearchDto, seats: number): FlightDetails | undefined {
  const result = flightDetails(flight);
  result.cabins = result.cabins.filter((c) => (!query.cabin || c.cabin === query.cabin) && c.available >= seats);
  return result.cabins.length ? result : undefined;
}

/** Stable total ordering across pages and repeated requests, including equal-price pairs. */
export function compareOffers(a: FlightOffer, b: FlightOffer, sort: FlightSort = FlightSort.Price) {
  const departure = a.outbound.departureAt.getTime() - b.outbound.departureAt.getTime();
  const primary = sort === FlightSort.Duration ? a.durationMinutes - b.durationMinutes : sort === FlightSort.Departure ? departure : a.price - b.price;
  return primary || departure || a.outbound.id.localeCompare(b.outbound.id) || (a.inbound?.id ?? '').localeCompare(b.inbound?.id ?? '');
}
