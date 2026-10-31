import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('refund tiers are inclusive, order independent, and never refund after departure', () => {
  const { computeRefundPercent } = require('./flight-policy');
  const tiers = [{ minDays: 7, refundPercent: 100 }, { minDays: 2, refundPercent: 50 }];
  for (const [days, expected] of [[8, 100], [7, 100], [6.99, 50], [2, 50], [1, 0], [0, 0], [-1, 0]]) {
    assert.equal(computeRefundPercent(tiers, days), expected);
  }
  assert.equal(computeRefundPercent([...tiers].reverse(), 7), 100);
  assert.equal(computeRefundPercent([], 10), 0);
  assert.throws(() => computeRefundPercent([{ minDays: 0, refundPercent: 101 }], 1));
  assert.throws(() => computeRefundPercent(tiers, NaN));
});

const airlineId = '507f1f77bcf86cd799439011';
const flightId = '507f1f77bcf86cd799439012';
const moderator: any = { id: airlineId, role: 'airline_moderator', moderatorAssignment: { providerType: 'airline', providerId: airlineId } };
const query = (value: any) => ({ exec: async () => value, lean() { return this; }, sort() { return this; }, select() { return this; }, skip() { return this; }, limit() { return this; } });
function fixture(overrides: any = {}) {
  const calls: any[] = [];
  const airlines = { create: async (data: any) => ({ _id: airlineId, ...data }), findById: () => query({ _id: airlineId }), findByIdAndUpdate: (...args: any[]) => { calls.push(['airlineUpdate', ...args]); return query({ _id: airlineId }); } };
  const reference = { assertCountryCodes: async (v: any) => { calls.push(['countries', v]); return v; }, assertSupportedCurrency: async (v: any) => v };
  const media = { saveImages: async (v: any) => { calls.push(['media', v]); return [{ id: flightId, url: '/uploads/logo.png' }]; } };
  const audit = { log: async (...args: any[]) => calls.push(['audit', ...args]) };
  const notifications = { notifyMany: async (...args: any[]) => calls.push(['notify', ...args]) };
  const { FlightsService } = require('./flights.service');
  const service = new FlightsService(overrides.flights ?? {}, overrides.airlines ?? airlines, overrides.bookings ?? {}, overrides.reference ?? reference, media, audit, notifications, { get: () => 'USD' });
  return { service, calls };
}

test('airline creation enforces admin in service, validates countries, and audits', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.createAirline(moderator, { name: 'Test Air', code: 'TA', countryCode: 'EG' }), /Admin/);
  assert.equal(calls.length, 0);
  const result = await service.createAirline({ ...moderator, role: 'admin' }, { name: 'Test Air', code: 'TA', countryCode: 'EG' });
  assert.equal(result.name, 'Test Air');
  assert.equal(calls[0][0], 'countries');
  assert.equal(calls[1][0], 'audit');
});

test('airline update and upload check assigned airline before any side effect', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.updateAirline(moderator, flightId, { name: 'Wrong' }), /assigned airline/);
  await assert.rejects(service.uploadLogo(moderator, flightId, {}), /assigned airline/);
  assert.equal(calls.length, 0);
  await service.updateAirline(moderator, airlineId, { name: 'New name' });
  await service.uploadLogo(moderator, airlineId, { buffer: Buffer.from('image') });
  assert.equal(calls.find((c) => c[0] === 'media')[1].ownerType, 'airline_logo');
  await assert.rejects(service.uploadLogo(moderator, airlineId, undefined), /image/);
});

test('airline DTO and schema reject malformed identity and unknown fields', async () => {
  const { CreateAirlineDto } = require('./dto/flights.dto');
  const { buildValidationPipe } = require('../../common/pipes/validation');
  const pipe = buildValidationPipe();
  const metadata: any = { type: 'body', metatype: CreateAirlineDto };
  await assert.rejects(pipe.transform({ name: '', code: 'long!', countryCode: 'invalid', extra: 1 }, metadata));
  const dto = await pipe.transform({ name: 'Test Air', code: 'TA', countryCode: 'EG' }, metadata);
  assert.equal(dto.name, 'Test Air');
  const { model } = require('mongoose');
  const { AirlineSchema } = require('./schemas/airline.schema');
  assert.ok(new (model('AirlineTest', AirlineSchema))({}).validateSync());
});

const input: any = {
  airlineId, flightNumber: 'TA101', origin: 'CAI', destination: 'LHR',
  departureLocal: '2030-11-05T10:00', arrivalLocal: '2030-11-05T13:00', currency: 'USD',
  cabins: [{ cabin: 'economy', capacity: 10, price: 100 }],
  baggagePolicy: { cabinKg: 7, checkedKg: 23, extraKgPrice: 5 },
  cancellationTiers: [{ minDays: 7, refundPercent: 100 }],
};
const airports: any = { CAI: { _id: airlineId, iataCode: 'CAI', timezone: 'Africa/Cairo' }, LHR: { _id: flightId, iataCode: 'LHR', timezone: 'Europe/London' } };
const refs: any = { resolveAirport: async (v: string) => { if (!airports[v]) throw Error('Unknown airport'); return airports[v]; }, assertSupportedCurrency: async (v: string) => v };

test('flight creation validates scope, reference airports, UTC chronology and initializes counters', async () => {
  const { service } = fixture({ reference: refs, flights: { create: async (v: any) => v } });
  await assert.rejects(service.createFlight({ ...moderator, role: 'user' }, input), /assigned airline/);
  const created = await service.createFlight(moderator, input);
  assert.equal(created.departureAt.toISOString(), '2030-11-05T08:00:00.000Z');
  assert.equal(created.arrivalAt.toISOString(), '2030-11-05T13:00:00.000Z');
  assert.equal(created.cabins[0].held, 0);
  assert.equal(created.cabins[0].booked, 0);
  for (const change of [{ destination: 'CAI' }, { arrivalLocal: '2030-11-05T01:00' }, { departureLocal: '2020-01-01T10:00' }, { departureLocal: '2030-11-05T10:00Z' }, { cabins: [input.cabins[0], input.cabins[0]] }, { currency: 'EUR' }]) {
    await assert.rejects(service.createFlight(moderator, { ...input, ...change }));
  }
});

test('nested DTO validation rejects counters, negative prices, invalid policies, null and malformed local dates', async () => {
  const { CreateFlightDto, UpdateFlightDto } = require('./dto/flights.dto');
  const { buildValidationPipe } = require('../../common/pipes/validation');
  const pipe = buildValidationPipe();
  assert.ok(await pipe.transform(input, { type: 'body', metatype: CreateFlightDto }));
  for (const change of [{ cabins: [{ ...input.cabins[0], held: 3 }] }, { cabins: [{ ...input.cabins[0], price: -1 }] }, { baggagePolicy: { ...input.baggagePolicy, cabinKg: -2 } }, { departureLocal: 'garbage' }]) {
    await assert.rejects(pipe.transform({ ...input, ...change }, { type: 'body', metatype: CreateFlightDto }));
  }
  await assert.rejects(pipe.transform({ cabins: null }, { type: 'body', metatype: UpdateFlightDto }));
});

test('atomic inventory calls guard the same cabin, counters, status and departure; release works after cancellation', async () => {
  const calls: any[] = [];
  const { service } = fixture({ flights: { updateOne: (...args: any[]) => { calls.push(args); return query({ modifiedCount: 1 }); } } });
  assert.equal(await service.reserveSeats(flightId, 'economy', 2), true);
  assert.equal(calls[0][0].status, 'scheduled');
  assert.ok(calls[0][0].departureAt.$gt instanceof Date);
  assert.ok(calls[0][0].$expr);
  assert.deepEqual(calls[0][1].$inc, { 'cabins.$[c].held': 2 });
  assert.deepEqual(calls[0][2].arrayFilters, [{ 'c.cabin': 'economy' }]);
  await service.releaseSeats(flightId, 'economy', 2);
  assert.equal(calls[1][0].status, undefined);
  assert.deepEqual(calls[1][0].cabins, { $elemMatch: { cabin: 'economy', held: { $gte: 2 } } });
  await service.convertHeldToBooked(flightId, 'economy', 2);
  assert.equal(calls[2][0].status, 'scheduled');
  assert.deepEqual(calls[2][1].$inc, { 'cabins.$[c].held': -2, 'cabins.$[c].booked': 2 });
  for (const n of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(service.reserveSeats(flightId, 'economy', n));
  await assert.rejects(service.releaseSeats(flightId, 'bad', 1));
  const noMatch = fixture({ flights: { updateOne: () => query({ modifiedCount: 0 }) } }).service;
  assert.equal(await noMatch.reserveSeats(flightId, 'economy', 1), false);
});

test('lifecycle uses guarded updates, skips cancelled flights, and catches up after downtime', async () => {
  const calls: any[] = [];
  const { service } = fixture({ flights: { updateMany: (...args: any[]) => { calls.push(args); return query({ modifiedCount: 1 }); } } });
  const now = new Date('2030-11-06T00:00Z');
  await service.advanceStatuses(now);
  assert.deepEqual(calls[0][0], { status: 'scheduled', departureAt: { $lte: now } });
  assert.equal(calls[0][1].$set.status, 'departed');
  assert.deepEqual(calls[1][0], { status: 'departed', arrivalAt: { $lte: now } });
  assert.equal(calls[1][1].$set.status, 'completed');
});

const storedFlight = () => ({
  ...input, _id: flightId, __v: 0, status: 'scheduled', originTimezone: 'Africa/Cairo', destinationTimezone: 'Europe/London',
  departureAt: new Date('2030-11-05T08:00Z'), arrivalAt: new Date('2030-11-05T13:00Z'),
  cabins: [{ cabin: 'economy', capacity: 10, price: 100, held: 2, booked: 3 }],
});

test('flight edit preserves counters and compares inventory snapshot to reject concurrent holds', async () => {
  const calls: any[] = [];
  const stored = storedFlight();
  const { service } = fixture({ reference: refs, flights: { findById: () => query(stored), findOneAndUpdate: (...args: any[]) => { calls.push(args); return query(stored); } }, bookings: { distinct: () => query([airlineId]) } });
  await service.updateFlight(moderator, flightId, { cabins: [{ cabin: 'economy', capacity: 6, price: 150 }] });
  assert.deepEqual(calls[0][0].cabins, stored.cabins);
  assert.equal(calls[0][0].__v, 0);
  assert.equal(calls[0][1].$set.cabins[0].held, 2);
  assert.equal(calls[0][1].$set.cabins[0].booked, 3);
  await assert.rejects(service.updateFlight(moderator, flightId, { cabins: [{ cabin: 'economy', capacity: 4, price: 150 }] }), /inventory/);
  await assert.rejects(service.updateFlight(moderator, flightId, { cabins: [{ cabin: 'business', capacity: 6, price: 150 }] }), /inventory/);
  const racing = fixture({ reference: refs, flights: { findById: () => query(stored), findOneAndUpdate: () => query(null) } }).service;
  await assert.rejects(racing.updateFlight(moderator, flightId, { flightNumber: 'TA102' }), /changed/);
});

test('edit and cancel enforce provider scope and scheduled future lifecycle; notify after successful mutation', async () => {
  let stored = storedFlight();
  const mutations: any[] = [];
  const { service, calls } = fixture({ reference: refs, flights: { findById: () => query(stored), findOneAndUpdate: (...args: any[]) => { mutations.push(args); return query({ ...stored, status: 'cancelled' }); } }, bookings: { distinct: () => query([airlineId]) } });
  const stranger = { ...moderator, moderatorAssignment: { providerType: 'airline', providerId: flightId } };
  await assert.rejects(service.cancelFlight(stranger, flightId), /assigned airline/);
  await assert.rejects(service.updateFlight(stranger, flightId, {}), /assigned airline/);
  assert.equal(mutations.length, 0);
  await service.cancelFlight(moderator, flightId);
  assert.equal(mutations[0][0].status, 'scheduled');
  assert.equal(mutations[0][1].$set.status, 'cancelled');
  assert.equal(calls.find((c) => c[0] === 'notify')[2].type, 'flight_cancelled');
  for (const status of ['cancelled', 'departed', 'completed']) {
    stored = { ...stored, status };
    await assert.rejects(service.cancelFlight(moderator, flightId));
    await assert.rejects(service.updateFlight(moderator, flightId, {}));
  }
  stored = { ...storedFlight(), departureAt: new Date(0) };
  await assert.rejects(service.cancelFlight(moderator, flightId));
});

test('local-date search uses origin timezone, availability, matched cabin prices and deterministic ordering', async () => {
  const filters: any[] = [];
  const a = { ...storedFlight(), _id: 'a', cabins: [{ cabin: 'economy', capacity: 4, held: 1, booked: 1, price: 200 }, { cabin: 'business', capacity: 10, held: 0, booked: 0, price: 50 }] };
  const b = { ...a, _id: 'b' };
  const full = { ...a, _id: 'full', cabins: [{ ...a.cabins[0], held: 4 }] };
  const { service } = fixture({ reference: refs, flights: { find: (filter: any) => { filters.push(filter); return query([b, full, a]); } } });
  const result = await service.search({ origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05', adults: 1, children: 1, infants: 1, cabin: 'economy', sort: 'price', minPrice: 150, maxPrice: 250, limit: 1, page: 2 });
  assert.equal(filters[0].departureAt.$gte.toISOString(), '2030-11-04T22:00:00.000Z');
  assert.equal(filters[0].departureAt.$lt.toISOString(), '2030-11-05T22:00:00.000Z');
  assert.equal(filters[0].status, 'scheduled');
  assert.equal(result.total, 2);
  assert.equal(result.items[0].outbound.id, 'b');
  assert.equal(result.items[0].price, 200);
  assert.equal(result.items[0].totalPrice, 400);
  assert.equal(result.items[0].outbound.cabins.length, 1);
  assert.equal(result.items[0].outbound.cabins[0].available, 2);
  for (const change of [{ infants: 2 }, { returnDate: '2030-11-04' }, { departureDate: '2030-02-30' }, { minPrice: 300, maxPrice: 100 }, { destination: 'CAI' }]) {
    await assert.rejects(service.search({ origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05', adults: 1, ...change }));
  }
});

test('round-trip search reverses route and timezone, pairs chronologically and sorts combined fares', async () => {
  const filters: any[] = [];
  const out = { ...storedFlight(), _id: 'out' };
  const back = { ...storedFlight(), _id: 'back', origin: 'LHR', destination: 'CAI', originTimezone: 'Europe/London', destinationTimezone: 'Africa/Cairo', departureAt: new Date('2030-11-06T08:00Z'), arrivalAt: new Date('2030-11-06T13:00Z') };
  const early = { ...back, _id: 'early', departureAt: new Date('2030-11-05T07:00Z') };
  const { service } = fixture({ reference: refs, flights: { find: (filter: any) => { filters.push(filter); return query(filter.origin === 'CAI' ? [out] : [early, back]); } } });
  const result = await service.search({ origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05', returnDate: '2030-11-06', adults: 1 });
  assert.equal(filters[1].origin, 'LHR');
  assert.equal(filters[1].departureAt.$gte.toISOString(), '2030-11-06T00:00:00.000Z');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].inbound.id, 'back');
  assert.equal(result.items[0].price, 200);
});

test('details include local airport times and current availability, with 404 for missing flight', async () => {
  const { service } = fixture({
    flights: { findById: () => query(storedFlight()) },
    airlines: { findById: () => query({ _id: airlineId, name: 'Test Air', code: 'TA', countryCode: 'EG' }) },
  });
  const result = await service.details(flightId);
  assert.equal(result.departureLocal, '2030-11-05T10:00:00.000+02:00');
  assert.equal(result.arrivalLocal, '2030-11-05T13:00:00.000+00:00');
  assert.equal(result.cabins[0].available, 5);
  assert.equal(result.durationMinutes, 300);
  assert.equal(result.airline.name, 'Test Air');
  assert.equal(result.airline.code, 'TA');
  await assert.rejects(fixture({ flights: { findById: () => query(null) } }).service.details(flightId), /not found/);
});

test('airport local validation rejects DST gaps, overlaps, offsets and invalid days; local day spans DST', () => {
  const { airportLocalToUtc } = require('./flight-validation');
  const { localDayRangeUtc } = require('../../common/utils/time.util');
  for (const local of ['2030-03-10T02:30', '2030-11-03T01:30', '2030-02-30T10:00', '2030-01-01T10:00Z']) {
    assert.throws(() => airportLocalToUtc(local, 'America/New_York'));
  }
  const spring = localDayRangeUtc('2030-03-10', 'America/New_York');
  const autumn = localDayRangeUtc('2030-11-03', 'America/New_York');
  assert.equal((spring.end - spring.start) / 3600000, 23);
  assert.equal((autumn.end - autumn.start) / 3600000, 25);
});

test('booking list and CSV share scope and filters, paginate lists and escape RFC4180 cells', async () => {
  const filters: any[] = [];
  const rows = [{ _id: flightId, reference: 'A,"B"\r\nC', userId: airlineId, status: 'Confirmed', cabin: 'economy', seats: 2, passengerNames: ['Alice Smith', 'Bob Jones'], createdAt: new Date('2030-01-01T00:00Z') }];
  const bookings = { find: (f: any) => { filters.push(f); return query(rows); }, countDocuments: () => query(1) };
  const { service } = fixture({ flights: { findById: () => query(storedFlight()) }, bookings });
  const q = { status: 'Confirmed', cabin: 'economy', reference: 'A.*', from: '2030-01-01', to: '2030-01-02', page: 1, limit: 10 };
  const result = await service.listBookings(moderator, flightId, q);
  const csv = await service.bookingsCsv(moderator, flightId, q);
  assert.equal(result.total, 1);
  assert.deepEqual(filters[0], filters[1]);
  assert.equal(String(filters[0].flightId), flightId);
  assert.equal(filters[0].reference.source, 'A\\.\\*');
  assert.equal(filters[0].createdAt.$lt.toISOString(), '2030-01-03T00:00:00.000Z');
  assert.ok(csv.startsWith('"reference","passenger names","cabin","seats","status"\r\n'));
  assert.ok(csv.includes('"A,""B""\r\nC","Alice Smith, Bob Jones","economy","2","Confirmed"'));
  assert.ok(csv.endsWith('\r\n'));
  const stranger = { ...moderator, role: 'user' };
  await assert.rejects(service.listBookings(stranger, flightId, {}), /assigned airline/);
  await assert.rejects(service.bookingsCsv(stranger, flightId, {}), /assigned airline/);
  assert.equal(filters.length, 2);
  await assert.rejects(service.listBookings(moderator, flightId, { from: '2030-01-03', to: '2030-01-01' }));
});

test('CSV handles null, commas, quotes, CR/LF, unicode and spreadsheet formulas', () => {
  const { csvCell } = require('./booking-csv');
  for (const [input, expected] of [[null, '""'], [undefined, '""'], ['a,b', '"a,b"'], ['"x"', '"""x"""'], ['a\nb', '"a\nb"'], ['???', '"???"'], ['=SUM(A1)', '"\'=SUM(A1)"']]) {
    assert.equal(csvCell(input), expected);
  }
});

test('simultaneous reserve operations cannot oversell cabin capacity', async () => {
  const { FlightsService } = require('./flights.service');
  let cabin = { cabin: 'economy', capacity: 3, held: 0, booked: 0 };
  const flightsMock = {
    updateOne: (filter: any, update: any) => ({
      exec: async () => {
        const inc = update.$inc['cabins.$[c].held'];
        if (cabin.capacity - (cabin.booked + cabin.held) >= inc) {
          cabin = { ...cabin, held: cabin.held + inc };
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
    }),
  };
  const service = new FlightsService(flightsMock as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { get: () => 'USD' } as any);
  const [res1, res2] = await Promise.all([
    service.reserveSeats(flightId, 'economy', 2),
    service.reserveSeats(flightId, 'economy', 2),
  ]);
  assert.ok((res1 && !res2) || (!res1 && res2));
  assert.equal(cabin.held, 2);
  assert.ok(cabin.held + cabin.booked <= cabin.capacity);
});

test('HTTP routes declare public/role boundaries, ObjectId parsing, CSV headers and response documentation', async () => {
  const { FlightsController, AirlinesController } = require('./flights.controller');
  const { IS_PUBLIC_KEY, ROLES_KEY } = require('../../common/decorators');
  const { ROUTE_ARGS_METADATA } = require('@nestjs/common/constants');
  const { ParseObjectIdPipe } = require('../../common/pipes/parse-object-id.pipe');
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, FlightsController.prototype.search), true);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, FlightsController.prototype.details), true);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AirlinesController.prototype.create), ['admin']);
  for (const method of ['create', 'update', 'cancel', 'bookings', 'csv']) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, FlightsController.prototype[method]), ['airline_moderator']);
  }
  for (const method of ['details', 'update', 'cancel', 'bookings', 'csv']) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, FlightsController, method);
    assert.ok(Object.values(args).some((arg: any) => arg.pipes?.includes(ParseObjectIdPipe)));
  }
  const headers: any = {};
  const controller = new FlightsController({ bookingsCsv: async () => 'csv body' });
  const result = await controller.csv(moderator, flightId, {}, { setHeader: (k: string, v: string) => { headers[k] = v; } });
  assert.equal(result, 'csv body');
  assert.match(headers['Content-Type'], /text\/csv/);
  assert.match(headers['Content-Disposition'], /attachment/);
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
  const { FlightsService } = require('./flights.service');
  class HttpTestModule {}
  Module({ controllers: [FlightsController, AirlinesController], providers: [{ provide: FlightsService, useValue: {} }] })(HttpTestModule);
  const app = await NestFactory.create(HttpTestModule, { logger: false });
  try {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    assert.ok(doc.paths['/flights/search'].get.responses['200'].content['application/json'].schema);
    assert.ok(doc.paths['/flights/{id}/bookings.csv'].get.responses['200'].content['text/csv']);
    assert.ok(doc.components.schemas.CreateFlightDto);
    for (const path of Object.values(doc.paths) as any[]) for (const operation of Object.values(path) as any[]) {
      assert.ok(operation.summary);
      assert.ok(operation.responses['400']);
    }
  } finally { await app.close(); }
});

test('FlightsModule exports its service and registers the separate read-only booking contract', () => {
  const { FlightsModule } = require('./flights.module');
  const { FlightsService } = require('./flights.service');
  assert.ok(Reflect.getMetadata('exports', FlightsModule).includes(FlightsService));
  const { FlightBookingViewSchema } = require('./schemas/flight-booking-view.schema');
  assert.equal(FlightBookingViewSchema.options.collection, 'flight_bookings');
  assert.equal(FlightBookingViewSchema.options.autoIndex, false);
});

test('FlightBookingView schema and bookingCsv enforce FLT-29 columns and reject malformed rows', () => {
  const { model } = require('mongoose');
  const { FlightBookingViewSchema } = require('./schemas/flight-booking-view.schema');
  const { bookingCsv } = require('./booking-csv');
  const Model = model('FlightBookingTest', FlightBookingViewSchema);
  const doc = new Model({ flightId, reference: 'REF123', cabin: 'economy', seats: 2, status: 'Confirmed', passengerNames: ['Jane Doe'] });
  assert.equal(doc.validateSync(), undefined);
  const invalid = new Model({ flightId, reference: 'REF123', cabin: 'economy', seats: 0, status: 'Invalid' });
  assert.ok(invalid.validateSync());
  const csv = bookingCsv([{ reference: 'R1', passengerNames: ['P1', 'P2'], cabin: 'business', seats: 2, status: 'Cancelled' } as any]);
  assert.equal(csv, '"reference","passenger names","cabin","seats","status"\r\n"R1","P1, P2","business","2","Cancelled"\r\n');
});

test('logo removal is scoped and public airline detail uses shared media', async () => {
  const { service } = fixture();
  service.media.list = async () => [{ url: '/uploads/logo.png' }];
  service.media.removeAllFor = async () => ({ deleted: 1 });
  await assert.rejects(service.removeLogo({ ...moderator, role: 'admin' }, airlineId), /assigned airline/);
  assert.deepEqual(await service.removeLogo(moderator, airlineId), { deleted: 1 });
  const detail = await service.airlineDetails(airlineId);
  assert.equal(detail.logo.url, '/uploads/logo.png');
});

test('Person 2 samples validate against schemas and seed via insert-only upserts', async () => {
  const { seedFlightSamples, sampleAirlines, sampleFlights } = require('./seed/flights.seed');
  const { model } = require('mongoose');
  const { AirlineSchema } = require('./schemas/airline.schema');
  const { FlightSchema } = require('./schemas/flight.schema');
  const AirlineModel = model('SampleAirlineTest', AirlineSchema);
  const FlightModel = model('SampleFlightTest', FlightSchema);
  for (const airline of sampleAirlines) assert.equal(new AirlineModel(airline).validateSync(), undefined);
  assert.ok(sampleFlights.length >= 2);
  const writes: any[] = [];
  const airlines = { findOneAndUpdate: (filter: any, update: any, options: any) => { writes.push([filter, update, options]); return query({ _id: airlineId }); } };
  const flights = { updateOne: (filter: any, update: any, options: any) => { writes.push([filter, update, options]); assert.equal(new FlightModel(update.$setOnInsert).validateSync(), undefined); return query({ upsertedCount: 1 }); } };
  await seedFlightSamples(airlines, flights, { ...refs, assertCountryCodes: async () => [] }, 'USD', '2030-11-05');
  assert.equal(writes.length, sampleAirlines.length + sampleFlights.length);
  assert.ok(writes.every((w) => w[1].$setOnInsert && !w[1].$set && w[2].upsert));
  assert.equal(writes[sampleAirlines.length][1].$setOnInsert.departureAt.toISOString(), '2030-11-05T08:00:00.000Z');
});

test('HTTP integration test executes global validation and exception filter with standard error envelope', async () => {
  const { buildValidationPipe } = require('../../common/pipes/validation');
  const { AllExceptionsFilter } = require('../../common/filters/all-exceptions.filter');
  const { FlightSearchDto } = require('./dto/flights.dto');
  const pipe = buildValidationPipe();
  const filter = new AllExceptionsFilter();
  let caughtError: any;
  try {
    await pipe.transform({ adults: 0 }, { type: 'query', metatype: FlightSearchDto });
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError);
  let payload: any;
  let statusSet = 0;
  const mockHost: any = {
    switchToHttp: () => ({
      getResponse: () => ({ status: (s: number) => { statusSet = s; return { json: (body: any) => { payload = body; } }; } }),
      getRequest: () => ({ method: 'GET', originalUrl: '/api/flights/search' }),
    }),
  };
  filter.catch(caughtError, mockHost);
  assert.equal(statusSet, 400);
  assert.equal(payload.statusCode, 400);
  assert.match(payload.error, /bad request/i);
  assert.equal(payload.path, '/api/flights/search');
  assert.ok(Array.isArray(payload.errors));
});

test('price filters can select a higher-priced cabin when the cheapest cabin is outside the requested range', async () => {
  const flight = { ...storedFlight(), cabins: [...storedFlight().cabins, { cabin: 'business', capacity: 10, price: 300, held: 0, booked: 0 }] };
  const { service } = fixture({ reference: refs, flights: { find: () => query([flight]) } });
  const result = await service.search({ origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05', minPrice: 200, maxPrice: 400 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].price, 300);
  assert.equal(result.items[0].outbound.cabins[0].cabin, 'business');
});

test('reserve expression binds availability to one cabin and uses Mongo expression argument arrays', async () => {
  let filter: any;
  const { service } = fixture({ flights: { updateOne: (f: any) => { filter = f; return query({ modifiedCount: 1 }); } } });
  await service.reserveSeats(flightId, 'business', 3);
  assert.deepEqual(filter.$expr, { $anyElementTrue: [{ $map: { input: '$cabins', as: 'c', in: { $and: [
    { $eq: ['$$c.cabin', 'business'] },
    { $gte: [{ $subtract: ['$$c.capacity', { $add: ['$$c.booked', '$$c.held'] }] }, 3] },
  ] } } }] });
});

test('schema enforces unique cabin types, occupied capacity, ordered UTC instants and consistent cancellation tiers', () => {
  const { model } = require('mongoose');
  const { FlightSchema } = require('./schemas/flight.schema');
  const FlightModel = model('InvariantFlightTest', FlightSchema);
  assert.equal(new FlightModel(storedFlight()).validateSync(), undefined);
  for (const change of [
    { cabins: [] }, { cabins: [...storedFlight().cabins, ...storedFlight().cabins] },
    { cabins: [{ ...storedFlight().cabins[0], held: 9 }] },
    { arrivalAt: new Date('2030-11-05T07:00Z') },
    { cancellationTiers: [{ minDays: 0, refundPercent: 100 }, { minDays: 7, refundPercent: 50 }] },
  ]) assert.ok(new FlightModel({ ...storedFlight(), ...change }).validateSync());
});

test('validation helpers reject malformed cabin values and baggage must be an object', async () => {
  const { validateCabins } = require('./flight-validation');
  for (const cabin of [
    { cabin: 'bad', capacity: 10, price: 100 }, { cabin: 'economy', capacity: -1, price: 100 },
    { cabin: 'economy', capacity: 1.5, price: 100 }, { cabin: 'economy', capacity: 10, price: Infinity },
    { cabin: 'economy', capacity: 10, price: -1 },
  ]) assert.throws(() => validateCabins([cabin]));
  const { CreateFlightDto } = require('./dto/flights.dto');
  const { buildValidationPipe } = require('../../common/pipes/validation');
  await assert.rejects(buildValidationPipe().transform({ ...input, baggagePolicy: [] }, { type: 'body', metatype: CreateFlightDto }));
});

test('search DTO transforms query numbers and rejects invalid sorts, counts, limits, prices and extra fields', async () => {
  const { FlightSearchDto, FlightBookingQueryDto } = require('./dto/flights.dto');
  const { buildValidationPipe } = require('../../common/pipes/validation');
  const pipe = buildValidationPipe();
  const base = { origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05' };
  const valid = await pipe.transform({ ...base, adults: '2', limit: '5' }, { type: 'query', metatype: FlightSearchDto });
  assert.equal(valid.adults, 2);
  assert.equal(valid.limit, 5);
  assert.equal(valid.sort, 'price');
  for (const change of [{ adults: '0' }, { children: '1.5' }, { infants: '-1' }, { sort: 'random' }, { minPrice: '-1' }, { maxPrice: 'NaN' }, { cabin: 'cargo' }, { limit: '101' }, { extra: 'x' }]) {
    await assert.rejects(pipe.transform({ ...base, ...change }, { type: 'query', metatype: FlightSearchDto }));
  }
  await assert.rejects(pipe.transform({ status: 'paid' }, { type: 'query', metatype: FlightBookingQueryDto }));
});

test('all search sorts are deterministic, with inclusive price bounds and empty-page metadata', async () => {
  const a = { ...storedFlight(), _id: 'a', departureAt: new Date('2030-11-05T10:00Z'), arrivalAt: new Date('2030-11-05T12:00Z') };
  const b = { ...storedFlight(), _id: 'b', departureAt: new Date('2030-11-05T08:00Z'), arrivalAt: new Date('2030-11-05T11:00Z'), cabins: [{ ...a.cabins[0], price: 200 }] };
  const c = { ...a, _id: 'c', departureAt: new Date('2030-11-05T12:00Z'), arrivalAt: new Date('2030-11-05T13:00Z'), cabins: [{ ...a.cabins[0], price: 300 }] };
  const { service } = fixture({ reference: refs, flights: { find: () => query([c, b, a]) } });
  const base = { origin: 'CAI', destination: 'LHR', departureDate: '2030-11-05' };
  for (const [sort, expected] of [['price', ['a', 'b', 'c']], ['duration', ['c', 'a', 'b']], ['departure', ['b', 'a', 'c']]]) {
    const result = await service.search({ ...base, sort });
    assert.deepEqual(result.items.map((i: any) => i.outbound.id), expected);
  }
  const exact = await service.search({ ...base, minPrice: 200, maxPrice: 200 });
  assert.equal(exact.total, 1);
  const empty = await service.search({ ...base, page: 2 });
  assert.equal(empty.total, 3);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.totalPages, 1);
});

test('refund policy validates duplicate/descending thresholds, does not mutate, and handles zero-day boundary', () => {
  const { computeRefundPercent } = require('./flight-policy');
  const tiers = Object.freeze([Object.freeze({ minDays: 0, refundPercent: 20 }), Object.freeze({ minDays: 7, refundPercent: 100 })]);
  assert.equal(computeRefundPercent(tiers, 0), 20);
  assert.equal(computeRefundPercent(tiers, -0.01), 0);
  assert.equal(computeRefundPercent(tiers, 7), 100);
  for (const invalid of [
    [{ minDays: 0, refundPercent: 10 }, { minDays: 0, refundPercent: 20 }],
    [{ minDays: 0, refundPercent: 100 }, { minDays: 7, refundPercent: 20 }],
    [{ minDays: -1, refundPercent: 20 }], [{ minDays: 0.5, refundPercent: 20 }],
    [{ minDays: 0, refundPercent: NaN }], [{ minDays: 0, refundPercent: -1 }],
  ]) assert.throws(() => computeRefundPercent(invalid, 10));
});

test('details resolve effective lifecycle at exact time boundaries and never offer cancelled seats', () => {
  const { flightDetails } = require('./flight-search');
  const stored = storedFlight();
  const departed = flightDetails(stored, stored.departureAt);
  assert.equal(departed.status, 'departed');
  assert.equal(departed.cabins[0].available, 0);
  assert.equal(flightDetails(stored, stored.arrivalAt).status, 'completed');
  assert.equal(flightDetails({ ...stored, status: 'departed' }, stored.arrivalAt).status, 'completed');
  assert.equal(flightDetails({ ...stored, status: 'cancelled' }, new Date()).cabins[0].available, 0);
});

test('schedule edits notify affected booking users while fare-only edits do not', async () => {
  let target: any;
  const { service, calls } = fixture({ reference: refs,
    flights: { findById: () => query(storedFlight()), findOneAndUpdate: () => query(storedFlight()) },
    bookings: { distinct: (field: any, filter: any) => { target = [field, filter]; return query([airlineId]); } },
  });
  await service.updateFlight(moderator, flightId, { departureLocal: '2030-11-05T11:00' });
  assert.equal(target[0], 'userId');
  assert.deepEqual(target[1].status.$in, ['pending_payment', 'confirmed']);
  assert.equal(calls[0][2].type, 'flight_schedule_changed');
  calls.length = 0;
  await service.updateFlight(moderator, flightId, { cabins: [{ cabin: 'economy', capacity: 10, price: 120 }] });
  assert.equal(calls.length, 0);
});
