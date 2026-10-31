import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { ReferenceDataService } from '../../reference-data/reference-data.service';
import { airportLocalToUtc, validateLocalDate } from '../flight-validation';
import { CabinType, FlightStatus } from '../schemas/flight.schema';

/** Fictional providers for Person 2 demos; no real airline identity is implied. */
export const sampleAirlines = [
  { code: 'TA', name: 'Sample Nile Air', countryCode: 'EG', description: 'Person 2 sample airline' },
  { code: 'SA', name: 'Sample Horizon Air', countryCode: 'EG', description: 'Person 2 sample airline' },
];
export const sampleFlights = [
  { code: 'TA', flightNumber: 'TA101', origin: 'CAI', destination: 'LHR', day: 0, departure: '10:00', arrival: '13:00', price: 200 },
  { code: 'TA', flightNumber: 'TA102', origin: 'LHR', destination: 'CAI', day: 7, departure: '10:00', arrival: '17:00', price: 210 },
  { code: 'SA', flightNumber: 'SA201', origin: 'CAI', destination: 'LHR', day: 0, departure: '14:00', arrival: '17:00', price: 180 },
  { code: 'SA', flightNumber: 'SA202', origin: 'LHR', destination: 'CAI', day: 7, departure: '14:00', arrival: '21:00', price: 190 },
];

/**
 * Run reference seeding first. SEED_FLIGHT_DATE fixes the origin date for reproducible demos;
 * otherwise use 30 days from today. Insert-only natural-key upserts preserve existing seats,
 * prices, policies and status on rerun. Does not modify accounts or moderator assignments.
 */
export async function seedFlightSamples(
  airlines: Model<any>, flights: Model<any>, reference: ReferenceDataService, currency: string,
  date = DateTime.utc().plus({ days: 30 }).toISODate(),
) {
  validateLocalDate(date);
  await reference.assertCountryCodes(sampleAirlines.map((a) => a.countryCode));
  await reference.assertSupportedCurrency(currency);
  // Resolve prerequisites before writing anything, so absent reference data fails clearly.
  const airports = new Map(await Promise.all(['CAI', 'LHR'].map(async (iata) => [iata, await reference.resolveAirport(iata)] as const)));
  const ids = new Map<string, unknown>();
  for (const airline of sampleAirlines) {
    const doc = await airlines.findOneAndUpdate({ code: airline.code }, { $setOnInsert: airline }, { upsert: true, new: true, runValidators: true }).exec();
    ids.set(airline.code, doc._id);
  }
  for (const sample of sampleFlights) {
    const day = DateTime.fromISO(date, { zone: 'UTC' }).plus({ days: sample.day }).toISODate();
    const origin = airports.get(sample.origin), destination = airports.get(sample.destination);
    const departureAt = airportLocalToUtc(`${day}T${sample.departure}`, origin.timezone);
    const data = {
      airlineId: ids.get(sample.code), flightNumber: sample.flightNumber, origin: sample.origin, destination: sample.destination,
      originTimezone: origin.timezone, destinationTimezone: destination.timezone, departureAt,
      arrivalAt: airportLocalToUtc(`${day}T${sample.arrival}`, destination.timezone), currency,
      status: FlightStatus.Scheduled,
      cabins: [
        { cabin: CabinType.Economy, capacity: 120, price: sample.price, held: 0, booked: 0 },
        { cabin: CabinType.Business, capacity: 12, price: sample.price * 3, held: 0, booked: 0 },
      ],
      baggagePolicy: { cabinKg: 7, checkedKg: 23, extraKgPrice: 10 },
      cancellationTiers: [{ minDays: 0, refundPercent: 0 }, { minDays: 2, refundPercent: 50 }, { minDays: 7, refundPercent: 100 }],
    };
    await flights.updateOne({ airlineId: data.airlineId, flightNumber: data.flightNumber, departureAt }, { $setOnInsert: data }, { upsert: true, runValidators: true }).exec();
  }
  return { airlines: sampleAirlines.length, flights: sampleFlights.length, departureDate: date };
}
