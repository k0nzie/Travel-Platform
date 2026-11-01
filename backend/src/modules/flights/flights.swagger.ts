import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const number: SchemaObject = { type: 'number' };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties });
const cabinEnum: SchemaObject = { type: 'string', enum: ['Economy', 'Premium Economy', 'Business', 'First'] };
export const mediaResponse = object({ id: text, url: text, mimeType: text, size: integer, createdAt: date });
export const baggagePolicyResponse: SchemaObject = {
  ...object({ extraBagPrice: number, maxExtraBagsPerPassenger: integer, cabins: { type: 'array', items: object({ cabin: cabinEnum, freeBags: integer, maxWeightKg: number }) } }),
  nullable: true,
};
export const cancellationTiersResponse: SchemaObject = { type: 'array', items: object({ minDays: integer, refundPercent: { type: 'number', minimum: 0, maximum: 100 } }) };
export const airlineResponse = object({
  _id: text, name: text, code: text, countryCode: text, description: text, status: { type: 'string', enum: ['active', 'suspended'] },
  baggagePolicy: baggagePolicyResponse, cancellationTiers: cancellationTiersResponse, createdAt: date, updatedAt: date,
});
export const flightResponse = object({
  _id: text, airlineId: text, flightNumber: text, origin: text, destination: text,
  originTimezone: text, destinationTimezone: text, departureAt: date, arrivalAt: date, currency: text,
  status: { type: 'string', enum: ['Scheduled', 'Departed', 'Completed', 'Cancelled'] },
  cabins: { type: 'array', items: object({ _id: text, cabin: cabinEnum, capacity: integer, price: number, held: integer, booked: integer }) },
});
export const detailsResponse: SchemaObject = object({
  ...Object.fromEntries(Object.entries(flightResponse.properties).filter(([key]) => key !== '_id')) as Record<string, SchemaObject>,
  id: text, departureLocal: date, arrivalLocal: date, durationMinutes: number,
  airline: { ...airlineResponse, nullable: true },
  baggagePolicy: baggagePolicyResponse, cancellationTiers: cancellationTiersResponse,
  cabins: { type: 'array', items: object({ _id: text, cabin: text, capacity: integer, price: number, held: integer, booked: integer, available: integer }) },
});
export const cancelResponse = object({ flight: flightResponse, cancelledBookings: integer, expiredBookings: integer });
export const bookingResponse = object({
  _id: text, flightId: text, userId: text, reference: text, passengerNames: { type: 'array', items: text }, cabin: text, seats: integer,
  status: { type: 'string', enum: ['pending_payment', 'confirmed', 'completed', 'expired', 'cancelled'] }, refundPercent: number, createdAt: date,
});
export const offerResponse = object({ outbound: detailsResponse, inbound: detailsResponse, price: number, totalPrice: number, durationMinutes: number });
export const pageResponse = (items: SchemaObject): SchemaObject => object({ items: { type: 'array', items }, page: integer, limit: integer, total: integer, totalPages: integer });
