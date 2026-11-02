import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { computeRefundPercent } from '../../flights/flight-policy';
import { FlightsService } from '../../flights/flights.service';
import { AirlineStatus } from '../../flights/schemas/airline.schema';
import { CabinType, FlightStatus } from '../../flights/schemas/flight.schema';
import { ReferenceDataService } from '../../reference-data/reference-data.service';
import {
  AirportInfo,
  CancellationTier,
  FlightInventoryPort,
  FlightSnapshot,
  PassengerType,
} from '../ports/flight-inventory.port';

/** Flights store prices in major units; bookings and Stripe use integer minor units. */
const toMinor = (amount: number) => Math.round(amount * 100);
const INFANT_FARE_SHARE = 0.1; // FLT-12

/**
 * Maps Person 2's FlightsService onto the FlightInventoryPort that bookings use.
 * The only place that knows both shapes; seat moves delegate unchanged.
 */
@Injectable()
export class FlightsInventoryAdapter implements FlightInventoryPort {
  constructor(
    private readonly flights: FlightsService,
    private readonly reference: ReferenceDataService,
  ) {}

  async getFlightForBooking(flightId: string): Promise<FlightSnapshot | null> {
    const found = await this.flights.getForBooking(flightId);
    if (!found) return null;
    const { flight, airline } = found;
    const [origin, destination] = await Promise.all([
      this.airport(flight.origin, flight.originTimezone),
      this.airport(flight.destination, flight.destinationTimezone),
    ]);

    const policy = airline?.baggagePolicy;
    return {
      flightId: String(flight._id),
      flightNumber: flight.flightNumber,
      airlineId: String(flight.airlineId),
      airlineName: airline?.name ?? 'Unknown airline',
      origin,
      destination,
      departureAt: flight.departureAt,
      arrivalAt: flight.arrivalAt,
      bookable:
        flight.status === FlightStatus.Scheduled &&
        flight.departureAt > new Date() &&
        airline?.status === AirlineStatus.Active,
      currency: flight.currency,
      cabins: flight.cabins.map((cabin) => {
        const fare = toMinor(cabin.price);
        const allowance = policy?.cabins?.find((c) => c.cabin === cabin.cabin);
        return {
          cabinClass: cabin.cabin,
          availableSeats: Math.max(0, cabin.capacity - cabin.held - cabin.booked),
          fares: {
            [PassengerType.Adult]: fare,
            [PassengerType.Child]: fare,
            [PassengerType.Infant]: Math.round(fare * INFANT_FARE_SHARE),
          },
          // No airline baggage policy yet means no free or extra bags can be promised.
          baggagePolicy: {
            freeBags: allowance?.freeBags ?? 0,
            maxWeightKg: allowance?.maxWeightKg ?? null,
            maxExtraBagsPerPassenger: policy?.maxExtraBagsPerPassenger ?? 0,
            extraBagPriceMinor: policy ? toMinor(policy.extraBagPrice) : 0,
          },
        };
      }),
      cancellationTiers: (airline?.cancellationTiers ?? []).map(({ minDays, refundPercent }) => ({ minDays, refundPercent })),
    };
  }

  reserveSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession) {
    return this.flights.reserveSeats(flightId, cabinClass, count, session);
  }

  releaseSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession) {
    return this.flights.releaseSeats(flightId, cabinClass, count, session);
  }

  convertHeldToBooked(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession) {
    return this.flights.convertHeldToBooked(flightId, cabinClass, count, session);
  }

  releaseBookedSeats(flightId: string, cabinClass: CabinType, count: number, session?: ClientSession) {
    return this.flights.releaseBookedSeats(flightId, cabinClass, count, session);
  }

  computeRefundPercent(tiers: CancellationTier[], daysRemaining: number) {
    return computeRefundPercent(tiers, daysRemaining);
  }

  private async airport(iataCode: string, timezone: string): Promise<AirportInfo> {
    const airport = await this.reference.resolveAirport(iataCode);
    return { iataCode, name: airport.name, cityName: airport.cityName, timezone };
  }
}
