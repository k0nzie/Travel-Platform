import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import Stripe from 'stripe';

/**
 * End-to-end flows over real HTTP against a real replica set, so transactions run
 * for real. Only Stripe's network calls are faked; webhook signatures are checked
 * by the real SDK. Flights are Person 2's real airlines/flights documents, so this
 * also covers the bookings <-> flights integration. Run with `npm run test:bookings`.
 */
const WEBHOOK_SECRET = 'whsec_test';

class FakeStripe {
  intents = new Map<string, any>();
  refundCalls: any[] = [];
  failNextRefund = false;
  private seq = 0;

  paymentIntents = {
    create: async (params: any) => {
      const intent = {
        id: `pi_${++this.seq}`,
        object: 'payment_intent',
        status: 'requires_payment_method',
        client_secret: `secret_${this.seq}`,
        amount: params.amount,
        currency: params.currency,
        metadata: params.metadata,
      };
      this.intents.set(intent.id, intent);
      return intent;
    },
    retrieve: async (id: string) => this.intents.get(id),
    cancel: async (id: string) => {
      const intent = this.intents.get(id);
      intent.status = 'canceled';
      return intent;
    },
  };

  refunds = {
    create: async (params: any, options: any) => {
      this.refundCalls.push({ ...params, idempotencyKey: options.idempotencyKey });
      if (this.failNextRefund) {
        this.failNextRefund = false;
        throw new Error('stripe is down');
      }
      return { id: `re_${this.refundCalls.length}`, status: 'succeeded' };
    },
  };
}

let mongo: MongoMemoryReplSet;
let app: NestExpressApplication;
let base: string;
let db: Connection;
let stripe: FakeStripe;
let bookings: any;
let payments: any;
let flightsService: any;
let airlineId: Types.ObjectId;
let alice: string;
let bob: string;
let flights: Record<string, any>;
let eventSeq = 0;

const api = async (path: string, opts: { cookie?: string; method?: string; body?: unknown } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, res };
};

const signUp = async (email: string) => {
  const password = 'Travel2026';
  const reg = await api('/auth/register', { body: { name: 'Test', email, password, acceptTerms: true } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const login = await api('/auth/login', { body: { email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return login.res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
};

const webhook = (event: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
};

const stripeEvent = (type: string, object: any, id = `evt_${++eventSeq}`) => ({
  id,
  object: 'event',
  type,
  data: { object },
});

const adult = (over: Record<string, unknown> = {}) => ({
  type: 'adult',
  firstName: 'Sara',
  lastName: 'Hassan',
  dateOfBirth: '1995-04-20',
  nationality: 'EG',
  passportNumber: 'A1234567',
  ...over,
});

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

const oneWay = (flight: any, passengers: unknown[] = [adult()]) => ({
  legs: [{ flightId: String(flight._id), cabinClass: 'Economy' }],
  passengers,
});

/** Economy counters of a real flight document. */
const cabin = async (flight: any) => {
  const doc = await db.collection('flights').findOne({ _id: flight._id });
  const c = doc.cabins[0];
  return { available: c.capacity - c.held - c.booked, held: c.held, booked: c.booked };
};

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Person 2's real documents: one airline with policies, three scheduled flights. */
const seedFlights = async () => {
  const airline = await db.models.Airline.create({
    name: 'Test Air',
    code: 'TA',
    countryCode: 'EG',
    status: 'active',
    baggagePolicy: {
      extraBagPrice: 30,
      maxExtraBagsPerPassenger: 2,
      cabins: [
        { cabin: 'Economy', freeBags: 1, maxWeightKg: 23 },
        { cabin: 'Business', freeBags: 2, maxWeightKg: 32 },
      ],
    },
    cancellationTiers: [
      { minDays: 0, refundPercent: 0 },
      { minDays: 2, refundPercent: 25 },
      { minDays: 14, refundPercent: 100 },
    ],
  });
  airlineId = airline._id;
  const flight = (flightNumber: string, from: string, to: string, departureAt: Date, cabins: unknown[]) =>
    db.models.Flight.create({
      airlineId,
      flightNumber,
      origin: from,
      destination: to,
      originTimezone: from === 'CAI' ? 'Africa/Cairo' : 'Asia/Dubai',
      destinationTimezone: to === 'CAI' ? 'Africa/Cairo' : 'Asia/Dubai',
      departureAt,
      departureDay: departureAt.toISOString().slice(0, 10),
      arrivalAt: new Date(departureAt.getTime() + 3 * 3_600_000),
      currency: 'USD',
      status: 'Scheduled',
      cabins,
    });
  const standard = () => [
    { cabin: 'Economy', capacity: 100, price: 200, held: 0, booked: 0 },
    { cabin: 'Business', capacity: 20, price: 600, held: 0, booked: 0 },
  ];
  return Promise.all([
    flight('TA101', 'CAI', 'DXB', days(30), standard()),
    flight('TA102', 'DXB', 'CAI', days(37), standard()),
    flight('TA103', 'CAI', 'DXB', days(3), [{ cabin: 'Economy', capacity: 2, price: 200, held: 0, booked: 0 }]),
  ]);
};

const moderator = () => ({
  id: String(new Types.ObjectId()),
  role: 'airline_moderator',
  moderatorAssignment: { providerType: 'airline', providerId: String(airlineId) },
});

const hold = async (cookie: string, dto: unknown) => {
  const res = await api('/flight-bookings/hold', { cookie, body: dto });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};

const acceptPolicies = (cookie: string, bookingId: string, accept = true) =>
  api(`/bookings/flight/${bookingId}/accept-policies`, { cookie, body: { accept } });

const startPayment = async (cookie: string, bookingId: string) => {
  const accepted = await acceptPolicies(cookie, bookingId);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const res = await api('/payments', {
    cookie,
    body: { bookingType: 'flight', bookingId },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const payment = await db.collection('payments').findOne({ _id: new Types.ObjectId(res.body.paymentId) });
  return { ...res.body, intentId: payment.stripePaymentIntentId };
};

const succeed = async (intentId: string) => {
  const intent = stripe.intents.get(intentId);
  intent.status = 'succeeded';
  intent.latest_charge = `ch_${intentId}`;
  const res = await webhook(stripeEvent('payment_intent.succeeded', intent));
  assert.equal(res.status, 200);
};

const book = async (cookie: string, dto: unknown) => {
  const booking = await hold(cookie, dto);
  const payment = await startPayment(cookie, booking.id);
  await succeed(payment.intentId);
  return { booking, payment };
};

const statusOf = async (id: string) =>
  (await db.collection('flight_bookings').findOne({ _id: new Types.ObjectId(id) })).status;

const paymentOf = (bookingId: string) =>
  db.collection('payments').findOne({ bookingId: new Types.ObjectId(bookingId) });

const backdateHold = (id: string) =>
  db
    .collection('flight_bookings')
    .updateOne({ _id: new Types.ObjectId(id) }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });

describe('flight bookings and payments', { concurrency: false }, () => {
  before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    Object.assign(process.env, {
      MONGODB_URI: mongo.getUri('travel_test'),
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      UPLOAD_DIR: process.env.TEMP ?? '.',
      BCRYPT_ROUNDS: '4',
    });

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const { buildValidationPipe } = await import('../src/common/pipes/validation');
    const { StripeService } = await import('../src/modules/payments/stripe.service');
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const { FlightBookingsService } = await import('../src/modules/flight-bookings/flight-bookings.service');
    const { FlightsService } = await import('../src/modules/flights/flights.service');

    app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(buildValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');

    assert.equal(app.get(ConfigService).get('platformCurrency'), 'USD');
    db = app.get(getConnectionToken());
    // Reference data the flights and bookings modules validate against.
    const [eg, ae] = [new Types.ObjectId(), new Types.ObjectId()];
    await db.collection('countries').insertMany([
      { _id: eg, code: 'EG', name: 'Egypt' },
      { _id: ae, code: 'AE', name: 'United Arab Emirates' },
    ]);
    const [cairo, dubai] = [new Types.ObjectId(), new Types.ObjectId()];
    await db.collection('cities').insertMany([
      { _id: cairo, name: 'Cairo', countryCode: 'EG', countryId: eg, timezone: 'Africa/Cairo' },
      { _id: dubai, name: 'Dubai', countryCode: 'AE', countryId: ae, timezone: 'Asia/Dubai' },
    ]);
    await db.collection('airports').insertMany([
      {
        iataCode: 'CAI',
        name: 'Cairo International Airport',
        cityId: cairo,
        cityName: 'Cairo',
        countryCode: 'EG',
        timezone: 'Africa/Cairo',
      },
      {
        iataCode: 'DXB',
        name: 'Dubai International Airport',
        cityId: dubai,
        cityName: 'Dubai',
        countryCode: 'AE',
        timezone: 'Asia/Dubai',
      },
    ]);
    // Transactions can't create a collection while its indexes are still building.
    await Promise.all(Object.values(db.models).map((m) => m.init()));
    await Promise.all(Object.values(db.models).map((m) => m.createCollection().catch(() => undefined)));

    stripe = new FakeStripe();
    (app.get(StripeService) as any).instance = stripe;
    bookings = app.get(FlightBookingsService);
    payments = app.get(PaymentsService);
    flightsService = app.get(FlightsService);
    alice = await signUp('alice@example.com');
    bob = await signUp('bob@example.com');
  });

  after(async () => {
    await app?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await db.collection('flights').deleteMany({});
    await db.collection('airlines').deleteMany({});
    await db.collection('flight_bookings').deleteMany({});
    await db.collection('payments').deleteMany({});
    await db.collection('notifications').deleteMany({});
    stripe.refundCalls = [];
    const [out, back, nearlyFull] = await seedFlights();
    flights = { out, back, nearlyFull };
  });

  it('documents the endpoints in Swagger without the webhook', () => {
    const { paths } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    for (const path of [
      '/api/flight-bookings',
      '/api/flight-bookings/hold',
      '/api/flight-bookings/{id}/e-ticket',
      '/api/bookings/{type}/{id}/policies',
      '/api/bookings/{type}/{id}/accept-policies',
      '/api/payments',
      '/api/payments/{id}/retry',
      '/api/refunds/{id}',
    ]) {
      assert.ok(paths[path], path);
    }
    assert.equal(paths['/api/payments/webhook'], undefined);
  });

  it('quotes on the server: fares, baggage, round-trip', async () => {
    const res = await api('/flight-bookings', {
      cookie: alice,
      body: {
        legs: [
          { flightId: String(flights.out._id), cabinClass: 'Economy' },
          { flightId: String(flights.back._id), cabinClass: 'Business' },
        ],
        passengers: [
          adult({ extraBags: 1 }),
          adult({ type: 'child', dateOfBirth: yearsAgo(5) }),
          adult({ type: 'infant', dateOfBirth: yearsAgo(1) }),
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // FLT-12: adult and child pay the fare, the infant 10%. Economy 200+200+20, business 600+600+60,
    // one extra bag on each leg at 30.
    assert.equal(res.body.totalMinor, 42000 + 126000 + 6000);
    assert.equal(res.body.seatCount, 2);
    assert.match(res.body.legs[1].departureLocal, /\+04:00$/);
    assert.equal((await cabin(flights.out)).held, 0);
  });

  it('rejects passenger rule violations', async () => {
    const f = flights.out;
    const infant = adult({ type: 'infant', dateOfBirth: yearsAgo(1) });
    const cases: [string, unknown[]][] = [
      ['no adult', [adult({ type: 'child', dateOfBirth: yearsAgo(5) })]],
      ['more infants than adults', [adult(), infant, infant]],
      ['age does not match type', [adult({ dateOfBirth: yearsAgo(5) })]],
      ['too many bags', [adult({ extraBags: 3 })]],
      ['unknown country', [adult({ nationality: 'ZZ' })]],
      ['non-Latin name', [adult({ firstName: 'سارة' })]],
      ['ten passengers', Array(10).fill(adult())],
    ];
    for (const [name, passengers] of cases) {
      const res = await api('/flight-bookings/hold', { cookie: alice, body: oneWay(f, passengers) });
      assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.body)}`);
    }
    assert.equal((await api('/flight-bookings/hold', { body: oneWay(f) })).status, 401);
    assert.equal((await cabin(f)).held, 0);
  });

  it('rejects a return flight that does not reverse the route', async () => {
    const res = await api('/flight-bookings/hold', {
      cookie: alice,
      body: {
        legs: [
          { flightId: String(flights.out._id), cabinClass: 'Economy' },
          { flightId: String(flights.nearlyFull._id), cabinClass: 'Economy' },
        ],
        passengers: [adult()],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ROUND_TRIP');
  });

  it('never oversells under concurrent holds', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        api('/flight-bookings/hold', { cookie: alice, body: oneWay(flights.nearlyFull) }),
      ),
    );
    const codes = attempts.map((a) => a.status).sort();
    assert.deepEqual(codes, [201, 201, 409, 409, 409, 409, 409, 409], JSON.stringify(attempts.map((a) => a.body)));
    const c = await cabin(flights.nearlyFull);
    assert.equal(c.available, 0);
    assert.equal(c.held, 2);
  });

  it('rolls back the outbound hold when the return flight is full', async () => {
    await db.collection('flights').updateOne({ _id: flights.back._id }, { $set: { 'cabins.0.booked': 100 } });
    const res = await api('/flight-bookings/hold', {
      cookie: alice,
      body: {
        legs: [
          { flightId: String(flights.out._id), cabinClass: 'Economy' },
          { flightId: String(flights.back._id), cabinClass: 'Economy' },
        ],
        passengers: [adult()],
      },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'SEATS_UNAVAILABLE');
    assert.equal((await cabin(flights.out)).held, 0);
    assert.equal(await db.collection('flight_bookings').countDocuments(), 0);
  });

  it('hides a booking from strangers and requires policy acceptance', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    assert.equal((await api(`/flight-bookings/${booking.id}`, { cookie: bob })).status, 404);
    assert.equal((await api(`/bookings/flight/${booking.id}/policies`, { cookie: bob })).status, 404);

    const checkout = await api(`/bookings/flight/${booking.id}/policies`, { cookie: alice });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.amountMinor, 20000);
    assert.equal(checkout.body.policies.flights[0].cancellationTiers.length, 3);
    assert.equal(checkout.body.policies.flights[0].baggage.freeBags, 1);

    // PAY-02: payment is blocked until the policies are accepted.
    const early = await api('/payments', { cookie: alice, body: { bookingType: 'flight', bookingId: booking.id } });
    assert.equal(early.status, 400);
    assert.equal(early.body.code, 'POLICIES_NOT_ACCEPTED');
    assert.equal((await acceptPolicies(alice, booking.id, false)).status, 400);
    assert.equal((await acceptPolicies(bob, booking.id)).status, 404);
    const accepted = await acceptPolicies(alice, booking.id);
    assert.equal(accepted.status, 200);
    assert.ok(accepted.body.policiesAcceptedAt);
  });

  it('retries a declined card on the same intent, then confirms', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const first = await startPayment(alice, booking.id);

    const intent = stripe.intents.get(first.intentId);
    intent.last_payment_error = { message: 'Your card was declined.' };
    intent.latest_charge = 'ch_declined';
    await webhook(stripeEvent('payment_intent.payment_failed', intent));
    await webhook(stripeEvent('payment_intent.payment_failed', intent)); // new event id, same failure

    const failed = await paymentOf(booking.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failedAttempts, 1);
    assert.equal(await statusOf(booking.id), 'pending_payment');

    const retry = await api(`/payments/${first.paymentId}/retry`, { cookie: alice, method: 'POST' });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.clientSecret, first.clientSecret, 'retry reuses the same intent');

    await succeed(first.intentId);
    assert.equal(await statusOf(booking.id), 'confirmed');
    const seats = await cabin(flights.out);
    assert.deepEqual([seats.available, seats.held, seats.booked], [99, 0, 1]);

    const view = await api(`/flight-bookings/${booking.id}`, { cookie: alice });
    assert.equal(view.body.passengers[0].ticketNumber, `${booking.reference}-01`);

    const again = await api('/payments', { cookie: alice, body: { bookingType: 'flight', bookingId: booking.id } });
    assert.equal(again.status, 409);
    assert.equal(await db.collection('notifications').countDocuments({ type: 'payment_failed' }), 1);
    assert.equal(await db.collection('notifications').countDocuments({ type: 'booking_confirmed' }), 1);
  });

  it('checks webhook signatures and ignores redelivery', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const { intentId } = await startPayment(alice, booking.id);
    const intent = stripe.intents.get(intentId);
    intent.status = 'succeeded';
    const event = stripeEvent('payment_intent.succeeded', intent, 'evt_redelivered');

    assert.equal((await webhook(event, 'whsec_wrong')).status, 400);
    assert.equal(await statusOf(booking.id), 'pending_payment');

    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await cabin(flights.out)).booked, 1);
    assert.equal(await db.collection('notifications').countDocuments({ type: 'booking_confirmed' }), 1);
  });

  it('sync gives the same result as the webhook, and both together are harmless', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const { intentId, paymentId } = await startPayment(alice, booking.id);
    stripe.intents.get(intentId).status = 'succeeded';

    const synced = await api(`/payments/${paymentId}/sync`, { cookie: alice, method: 'POST' });
    assert.equal(synced.status, 200, JSON.stringify(synced.body));
    assert.equal(synced.body.status, 'succeeded');
    await succeed(intentId);
    assert.equal((await cabin(flights.out)).booked, 1);
    assert.equal((await api(`/payments/${paymentId}/sync`, { cookie: bob, method: 'POST' })).status, 404);
  });

  it('expires an unpaid hold, frees the seats and refunds a late payment', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const { intentId } = await startPayment(alice, booking.id);
    await backdateHold(booking.id);

    const tooLate = await api(`/bookings/flight/${booking.id}/policies`, { cookie: alice });
    assert.equal(tooLate.body.code, 'HOLD_EXPIRED');

    await bookings.expireHolds();
    await bookings.expireHolds();
    assert.equal(await statusOf(booking.id), 'expired');
    const seats = await cabin(flights.out);
    assert.deepEqual([seats.available, seats.held], [100, 0]);
    assert.equal(stripe.intents.get(intentId).status, 'canceled');

    // The charge beat the cancel and its webhook arrives afterwards.
    await succeed(intentId);
    assert.equal(await statusOf(booking.id), 'expired');
    assert.equal(stripe.refundCalls.length, 1);
    assert.equal(stripe.refundCalls[0].amount, 20000);
    const payment = await paymentOf(booking.id);
    assert.equal(payment.status, 'refunded');
    assert.equal(payment.refunds[0].reason, 'late_payment');
  });

  it('confirms a webhook that lands after the deadline while the seats are still held', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const { intentId } = await startPayment(alice, booking.id);
    await backdateHold(booking.id);
    await succeed(intentId);
    await bookings.expireHolds();
    assert.equal(await statusOf(booking.id), 'confirmed');
    assert.equal((await cabin(flights.out)).booked, 1);
  });

  it('gives a real e-ticket PDF to the owner, only once confirmed', async () => {
    const booking = await hold(alice, oneWay(flights.out));
    const early = await api(`/flight-bookings/${booking.id}/e-ticket`, { cookie: alice });
    assert.equal(early.body.code, 'TICKET_UNAVAILABLE');
    await succeed((await startPayment(alice, booking.id)).intentId);
    assert.equal((await api(`/flight-bookings/${booking.id}/e-ticket`, { cookie: bob })).status, 404);

    const res = await fetch(`${base}/api/flight-bookings/${booking.id}/e-ticket`, { headers: { cookie: alice } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), new RegExp(booking.reference));
    const pdf = Buffer.from(await res.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });

  it('cancels under the tiers, refunds once and frees the seats', async () => {
    const { booking } = await book(alice, oneWay(flights.nearlyFull)); // departs in 3 days -> 25%
    const preview = await api(`/flight-bookings/${booking.id}/cancellation-preview`, { cookie: alice });
    assert.equal(preview.body.refundMinor, 5000, JSON.stringify(preview.body));

    assert.equal((await api(`/flight-bookings/${booking.id}/cancel`, { cookie: bob, body: {} })).status, 404);
    const res = await api(`/flight-bookings/${booking.id}/cancel`, {
      cookie: alice,
      body: { reason: 'plans changed' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'cancelled');
    assert.equal(res.body.cancellation.refundMinor, 5000);

    const seats = await cabin(flights.nearlyFull);
    assert.deepEqual([seats.available, seats.booked], [2, 0]);
    assert.equal(stripe.refundCalls.length, 1);
    assert.equal(stripe.refundCalls[0].amount, 5000);
    assert.equal((await paymentOf(booking.id)).status, 'partially_refunded');

    const twice = await api(`/flight-bookings/${booking.id}/cancel`, { cookie: alice, body: {} });
    assert.equal(twice.status, 409);
    assert.equal(stripe.refundCalls.length, 1);
  });

  it('keeps a refund queued through a Stripe outage and retries with the same key', async () => {
    const { booking } = await book(alice, oneWay(flights.out)); // 30 days out -> 100%
    stripe.failNextRefund = true;
    const res = await api(`/flight-bookings/${booking.id}/cancel`, { cookie: alice, body: {} });
    assert.equal(res.status, 200);

    const queued = await paymentOf(booking.id);
    assert.equal(queued.refunds[0].status, 'queued');
    assert.equal(queued.status, 'succeeded');

    await payments.retryQueuedRefunds();
    assert.equal(stripe.refundCalls.length, 2);
    assert.equal(stripe.refundCalls[0].idempotencyKey, stripe.refundCalls[1].idempotencyKey);
    const paid = await paymentOf(booking.id);
    assert.equal(paid.status, 'refunded');
    assert.equal(paid.refunds[0].status, 'succeeded');

    // PAY-03: users see Pending / Refunded / Failed, on the refund and on the booking.
    const refund = await api(`/refunds/${paid.refunds[0]._id}`, { cookie: alice });
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(refund.body.status, 'Refunded');
    assert.equal((await api(`/refunds/${paid.refunds[0]._id}`, { cookie: bob })).status, 404);
    const details = await api(`/flight-bookings/${booking.id}`, { cookie: alice });
    assert.equal(details.body.payment.refunds[0].status, 'Refunded');

    await payments.retryQueuedRefunds();
    assert.equal(stripe.refundCalls.length, 2);
  });

  it('tracks refund status changes from the webhook', async () => {
    const { booking } = await book(alice, oneWay(flights.out));
    await api(`/flight-bookings/${booking.id}/cancel`, { cookie: alice, body: {} });
    const refundId = (await paymentOf(booking.id)).refunds[0].stripeRefundId;
    await webhook(stripeEvent('refund.failed', { id: refundId, object: 'refund', status: 'failed' }));
    assert.equal((await paymentOf(booking.id)).refunds[0].status, 'failed');
    assert.equal(await db.collection('notifications').countDocuments({ type: 'refund_updated' }), 1);
  });

  it('refuses a cancellation while the payment is unsettled, leaving the booking intact', async () => {
    const { booking } = await book(alice, oneWay(flights.out));
    await db
      .collection('payments')
      .updateOne({ bookingId: new Types.ObjectId(booking.id) }, { $set: { status: 'pending' } });
    const res = await api(`/flight-bookings/${booking.id}/cancel`, { cookie: alice, body: {} });
    assert.equal(res.body.code, 'PAYMENT_SETTLING');
    assert.equal(await statusOf(booking.id), 'confirmed');
    assert.equal((await cabin(flights.out)).booked, 1);
  });

  it('blocks deactivation while a confirmed trip is ahead (ACC-12)', async () => {
    const carol = await signUp('carol@example.com');
    await book(carol, oneWay(flights.out));
    const res = await api('/users/me', {
      cookie: carol,
      method: 'DELETE',
      body: { password: 'Travel2026', confirm: true },
    });
    assert.equal(res.body.code, 'HAS_UPCOMING_BOOKINGS', JSON.stringify(res.body));
  });

  it('FLT-06 end to end: the airline cancels through FlightsService, bookings refund and release seats', async () => {
    const roundTrip = {
      legs: [
        { flightId: String(flights.out._id), cabinClass: 'Economy' },
        { flightId: String(flights.back._id), cabinClass: 'Economy' },
      ],
      passengers: [adult()],
    };
    const { booking: paid } = await book(alice, roundTrip);
    const unpaid = await hold(bob, roundTrip);

    const result = await flightsService.cancelFlight(moderator(), String(flights.back._id));
    assert.equal(result.flight.status, 'Cancelled');
    assert.deepEqual([result.cancelledBookings, result.expiredBookings], [1, 1]);
    assert.equal(await statusOf(paid.id), 'cancelled');
    assert.equal(await statusOf(unpaid.id), 'expired');
    assert.equal(stripe.refundCalls[0].amount, 40000, '100% of both legs');
    const out = await cabin(flights.out);
    assert.deepEqual([out.available, out.held, out.booked], [100, 0, 0]);
    assert.equal(await db.collection('notifications').countDocuments({ type: 'flight_cancelled' }), 2);

    // Repeating the cancel is safe and refunds nothing twice.
    await flightsService.cancelFlight(moderator(), String(flights.back._id));
    assert.equal(stripe.refundCalls.length, 1);
  });

  it('FLT-29: the airline moderator sees booked passengers through FlightsService, not unpaid holds', async () => {
    await book(alice, oneWay(flights.out));
    await hold(bob, oneWay(flights.out));
    const list = await flightsService.listBookings(moderator(), String(flights.out._id), {});
    assert.equal(list.total, 1);
    assert.deepEqual(list.items[0].passengerNames, ['Sara Hassan']);
    assert.equal(list.items[0].cabin, 'Economy');
    assert.equal(list.items[0].status, 'confirmed');
    const csv = await flightsService.bookingsCsv(moderator(), String(flights.out._id), {});
    assert.match(csv, /"Sara Hassan","Economy","1","confirmed"/);
  });

  it('applies a schedule change and completes finished trips', async () => {
    const { booking } = await book(alice, oneWay(flights.out));
    const moved = new Date(Date.now() - 3 * 3_600_000);
    await db
      .collection('flights')
      .updateOne(
        { _id: flights.out._id },
        { $set: { departureAt: moved, arrivalAt: new Date(moved.getTime() + 3_600_000) } },
      );

    assert.deepEqual(await bookings.onScheduleChanged(String(flights.out._id)), { updated: 1 });
    assert.equal(await db.collection('notifications').countDocuments({ type: 'flight_schedule_changed' }), 1);
    const late = await api(`/flight-bookings/${booking.id}/cancel`, { cookie: alice, body: {} });
    assert.equal(late.body.code, 'FLIGHT_DEPARTED');

    await bookings.completeFinishedTrips();
    assert.equal(await statusOf(booking.id), 'completed');
    const past = await api('/flight-bookings?scope=past', { cookie: alice });
    assert.equal(past.body.total, 1);
    assert.equal(past.body.items[0].passengers[0].passportNumber, undefined);
    assert.equal((await api('/flight-bookings?scope=upcoming', { cookie: alice })).body.total, 0);
  });
});
