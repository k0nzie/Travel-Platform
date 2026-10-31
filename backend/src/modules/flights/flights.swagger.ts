import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const number: SchemaObject = { type: 'number' };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties });
export const mediaResponse = object({ id: text, url: text, mimeType: text, size: integer, createdAt: date });
export const airlineResponse = object({ _id: text, name: text, code: text, countryCode: text, description: text, createdAt: date, updatedAt: date });
export const flightResponse = object({
  _id: text, airlineId: text, flightNumber: text, origin: text, destination: text,
  originTimezone: text, destinationTimezone: text, departureAt: date, arrivalAt: date, currency: text,
  status: { type: 'string', enum: ['scheduled', 'departed', 'completed', 'cancelled'] },
  cabins: { type: 'array', items: object({ cabin: { type: 'string', enum: ['economy', 'business', 'first'] }, capacity: integer, price: number, held: integer, booked: integer }) },
  baggagePolicy: object({ cabinKg: number, checkedKg: number, extraKgPrice: number }),
  cancellationTiers: { type: 'array', items: object({ minDays: integer, refundPercent: { type: 'number', minimum: 0, maximum: 100 } }) },
});
export const detailsResponse: SchemaObject = object({
  ...Object.fromEntries(Object.entries(flightResponse.properties).filter(([key]) => key !== '_id')) as Record<string, SchemaObject>,
  id: text, departureLocal: date, arrivalLocal: date, durationMinutes: number,
  airline: { ...airlineResponse, nullable: true },
  cabins: { type: 'array', items: object({ cabin: text, capacity: integer, price: number, held: integer, booked: integer, available: integer }) },
});
export const bookingResponse = object({ _id: text, flightId: text, userId: text, reference: text, passengerNames: { type: 'array', items: text }, cabin: text, seats: integer, status: { type: 'string', enum: ['Confirmed', 'Cancelled'] }, createdAt: date });
export const offerResponse = object({ outbound: detailsResponse, inbound: detailsResponse, price: number, totalPrice: number, durationMinutes: number });
export const pageResponse = (items: SchemaObject): SchemaObject => object({ items: { type: 'array', items }, page: integer, limit: integer, total: integer, totalPages: integer });
