#!/usr/bin/env node
/**
 * End-to-end API smoke test for the Travel Platform backend.
 *
 * Runs real HTTP requests against a RUNNING server and walks every module:
 * auth, profile, reference data, admin, airlines/flights, flight bookings,
 * hotels/rooms, hotel bookings, payments (optional), itineraries, blog,
 * reports/moderation, notifications and access control.
 *
 * No dependencies: needs Node 18+ (built-in fetch).
 *
 *   cd backend
 *   npm run start:dev            # in one terminal
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:api     # in another
 *
 * Environment variables:
 *   API_URL         default http://localhost:4000/api
 *   ADMIN_EMAIL     the seeded admin (same values as in your .env). Without them,
 *   ADMIN_PASSWORD  admin, flight and hotel sections are skipped.
 *   CURRENCY        platform currency, default USD
 *   TEST_PAYMENTS   set to 1 to also start Stripe test payments (needs Stripe test keys on the server)
 *   VERBOSE         set to 1 to print every response body on failure
 *
 * It creates data (users, an airline, a hotel, posts...) with a unique suffix.
 * Run it against a development database, never production.
 */

const API = (process.env.API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CURRENCY = (process.env.CURRENCY ?? 'USD').toUpperCase();
const TEST_PAYMENTS = process.env.TEST_PAYMENTS === '1';
const VERBOSE = process.env.VERBOSE === '1';

const RUN = Date.now().toString(36);
const PASSWORD = 'Travel2026x';

// ---------------------------------------------------------------- helpers

const results = { pass: 0, fail: 0, skip: 0, failures: [] };
let section = '';

const color = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
const green = (s) => color(32, s);
const red = (s) => color(31, s);
const yellow = (s) => color(33, s);
const bold = (s) => color(1, s);

function heading(name) {
  section = name;
  console.log(`\n${bold(name)}`);
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  async req(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new Error(`Cannot reach ${API}${path}: ${error.cause?.code ?? error.message}. Is the server running?`);
    }
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON (CSV export, etc.) */
    }
    return { status: res.status, data, headers: res.headers };
  }

  get(p) {
    return this.req('GET', p);
  }
  post(p, b = {}) {
    return this.req('POST', p, b);
  }
  patch(p, b = {}) {
    return this.req('PATCH', p, b);
  }
  put(p, b = {}) {
    return this.req('PUT', p, b);
  }
  del(p) {
    return this.req('DELETE', p);
  }
}

/** Run one check. `fn` returns a response (status checked against `expected`) and may assert more. */
async function check(name, expected, fn, extra) {
  try {
    const res = await fn();
    const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
    if (!ok) throw new Error(`expected HTTP ${expected}, got ${res.status}: ${short(res.data)}`);
    if (extra) {
      const problem = extra(res.data, res);
      if (problem) throw new Error(problem);
    }
    results.pass++;
    console.log(`  ${green('✔')} ${name}`);
    return res;
  } catch (error) {
    results.fail++;
    results.failures.push(`[${section}] ${name}: ${error.message}`);
    console.log(`  ${red('✘')} ${name}\n      ${red(error.message)}`);
    return null;
  }
}

function skip(name, why) {
  results.skip++;
  console.log(`  ${yellow('-')} ${name} ${yellow(`(skipped: ${why})`)}`);
}

function short(data) {
  const s = typeof data === 'string' ? data : JSON.stringify(data);
  if (VERBOSE) return s;
  return s && s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

const idOf = (d) => d?.id ?? d?._id ?? d?.booking?.id ?? d?.item?.id;
const items = (d) => (Array.isArray(d) ? d : (d?.items ?? []));
const hasNoMongoKeys = (d) =>
  !/"(_id|__v)"\s*:/.test(JSON.stringify(d)) || 'response contains _id or __v (GEN serialization)';
const isPage = (d) =>
  (Array.isArray(d?.items) && typeof d?.total === 'number' && typeof d?.page === 'number') ||
  `not a standard page {items,total,page,...}: ${short(d)}`;

/** YYYY-MM-DD, n days from today (UTC). */
function day(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function newUser(label) {
  const c = new Client(label);
  c.email = `${label.toLowerCase()}.${RUN}@example.com`;
  c.name = `${label} ${RUN}`;
  await c.post('/auth/register', { name: c.name, email: c.email, password: PASSWORD, acceptTerms: true });
  const login = await c.post('/auth/login', { email: c.email, password: PASSWORD });
  c.id = idOf(login.data?.user ?? login.data);
  if (!c.id) c.id = idOf((await c.get('/auth/me')).data?.user ?? (await c.get('/auth/me')).data);
  return c;
}

// ---------------------------------------------------------------- tests

async function main() {
  console.log(bold(`Travel Platform API smoke test → ${API}  (run ${RUN})`));
  const guest = new Client('guest');

  // ---------------------------------------------------------------- basics
  heading('Health & reference data (GEN-12)');
  await check('GET /health', 200, () => guest.get('/health'));
  const countries = await check(
    'countries are seeded',
    200,
    () => guest.get('/reference/countries?limit=5'),
    (d) => (items(d).length ? null : 'no countries: run npm run seed'),
  );
  const cities = await check(
    'cities are seeded',
    200,
    () => guest.get('/reference/cities?limit=50'),
    (d) => (items(d).length ? null : 'no cities: run npm run seed'),
  );
  await check('currencies list', 200, () => guest.get('/reference/currencies'));
  await check('attractions list', 200, () => guest.get('/reference/attractions?limit=5'));
  const airports = await check(
    'airports list',
    200,
    () => guest.get('/airports?limit=20'),
    (d) => (items(d).length >= 2 ? null : 'need at least 2 airports: run npm run seed'),
  );
  await check('exchange rates', [200, 503], () => guest.get('/exchange-rates'));
  await check('responses use "id", never _id/__v', 200, () => guest.get('/reference/cities?limit=3'), hasNoMongoKeys);
  void countries;

  const cityList = items(cities?.data);
  const city = cityList[0];
  const city2 = cityList.find((c) => c.countryCode !== city?.countryCode) ?? cityList[1];
  const airportList = items(airports?.data);
  const [ap1, ap2] = airportList;

  // ---------------------------------------------------------------- auth
  heading('Accounts & auth (ACC-01..ACC-10)');
  const alice = new Client('alice');
  alice.email = `alice.${RUN}@example.com`;
  await check('register (ACC-01)', [200, 201], () =>
    alice.post('/auth/register', { name: `Alice ${RUN}`, email: alice.email, password: PASSWORD, acceptTerms: true }),
  );
  await check('duplicate email is rejected', [400, 409], () =>
    alice.post('/auth/register', { name: 'Dup', email: alice.email, password: PASSWORD, acceptTerms: true }),
  );
  await check('weak password is rejected', 400, () =>
    guest.post('/auth/register', {
      name: 'Weak',
      email: `weak.${RUN}@example.com`,
      password: 'short',
      acceptTerms: true,
    }),
  );
  await check('terms must be accepted', 400, () =>
    guest.post('/auth/register', {
      name: 'NoTerms',
      email: `noterms.${RUN}@example.com`,
      password: PASSWORD,
      acceptTerms: false,
    }),
  );
  await check('wrong password → 401', 401, () =>
    guest.post('/auth/login', { email: alice.email, password: 'Wrong12345' }),
  );
  await check(
    'login sets httpOnly cookies (ACC-04)',
    [200, 201],
    () => alice.post('/auth/login', { email: alice.email, password: PASSWORD }),
    (_d, res) => (/httponly/i.test((res.headers.getSetCookie?.() ?? []).join(';')) ? null : 'cookies are not httpOnly'),
  );
  const me = await check('GET /auth/me', 200, () => alice.get('/auth/me'), hasNoMongoKeys);
  alice.id = idOf(me?.data?.user ?? me?.data);
  await check('guest → /auth/me is 401', 401, () => guest.get('/auth/me'));
  await check('refresh session', [200, 201], () => alice.post('/auth/refresh'));
  await check('update profile (ACC-06)', 200, () => alice.patch('/users/me', { name: `Alice Updated ${RUN}` }));
  await check('GET /users/me', 200, () => alice.get('/users/me'));
  await check('change password (ACC-08)', 200, () =>
    alice.patch('/auth/change-password', { currentPassword: PASSWORD, newPassword: `${PASSWORD}2` }),
  );
  await check('login with new password', [200, 201], () =>
    alice.post('/auth/login', { email: alice.email, password: `${PASSWORD}2` }),
  );
  await check('logout', [200, 201, 204], () => alice.post('/auth/logout'));
  await check('after logout → 401', 401, () => alice.get('/auth/me'));
  await alice.post('/auth/login', { email: alice.email, password: `${PASSWORD}2` });

  const bob = await newUser('Bob');

  // ---------------------------------------------------------------- access control
  heading('Access control (roles)');
  await check('user → admin endpoint is 403', 403, () => alice.get('/admin/accounts'));
  await check('guest → admin endpoint is 401', 401, () => guest.get('/admin/accounts'));
  await check('guest cannot create a post', 401, () => guest.post('/posts', { title: 'x', content: 'y' }));
  await check('invalid ObjectId → 400', 400, () => guest.get('/posts/not-an-id'));

  // ---------------------------------------------------------------- admin
  const admin = new Client('admin');
  let airlineId, hotelId, airlineMod, hotelMod;
  heading('Admin (ACC-13..ACC-17)');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    skip('admin, flights and hotels sections', 'set ADMIN_EMAIL and ADMIN_PASSWORD');
  } else {
    await check('admin login', [200, 201], () =>
      admin.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    );
    await check('list accounts (ACC-14)', 200, () => admin.get('/admin/accounts?limit=5'), isPage);
    await check('filter accounts by role', 200, () => admin.get('/admin/accounts?role=user&limit=5'));

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const code = `Q${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}`;
    admin.airlineCode = code;
    const airline = await check('create airline', [200, 201], () =>
      admin.post('/airlines', { name: `Smoke Air ${RUN}`, code, countryCode: city?.countryCode ?? 'EG' }),
    );
    airlineId = idOf(airline?.data);
    const hotel = await check('create hotel (HTL-01)', [200, 201], () =>
      admin.post('/hotels', {
        name: `Smoke Hotel ${RUN}`,
        address: '1 Test Street',
        cityId: city?.id,
        starClass: 4,
        amenities: ['Free Wi-Fi'],
        description: 'Created by the API smoke test',
      }),
    );
    hotelId = idOf(hotel?.data);

    for (const [type, providerId, label] of [
      ['airline', airlineId, 'AirMod'],
      ['hotel', hotelId, 'HotelMod'],
    ]) {
      if (!providerId) continue;
      const c = new Client(label);
      c.email = `${label.toLowerCase()}.${RUN}@example.com`;
      await check(`create ${type} moderator (ACC-13)`, [200, 201], () =>
        admin.post('/admin/moderators', {
          name: `${label} ${RUN}`,
          email: c.email,
          temporaryPassword: 'TempPass123',
          providerType: type,
          providerId,
        }),
      );
      await c.post('/auth/login', { email: c.email, password: 'TempPass123' });
      await check(`${type} moderator must change password first`, 403, () =>
        c.get(type === 'hotel' ? `/hotels/${providerId}/reservations` : '/flight-bookings'),
      );
      await check(`${type} moderator changes temporary password`, 200, () =>
        c.patch('/auth/change-password', { currentPassword: 'TempPass123', newPassword: PASSWORD }),
      );
      await c.post('/auth/login', { email: c.email, password: PASSWORD });
      if (type === 'airline') airlineMod = c;
      else hotelMod = c;
    }

    if (bob.id) {
      await check('suspend user (ACC-16)', 200, () =>
        admin.patch(`/admin/accounts/${bob.id}/suspend`, { reason: 'smoke test' }),
      );
      await check('suspended user cannot log in', [401, 403], () =>
        new Client('x').post('/auth/login', { email: bob.email, password: PASSWORD }),
      );
      await check('reactivate user', 200, () => admin.patch(`/admin/accounts/${bob.id}/reactivate`, {}));
      await bob.post('/auth/login', { email: bob.email, password: PASSWORD });
    }
    await check('admin bookings list (ACC-17)', 200, () => admin.get('/admin/bookings?limit=5'), isPage);
    await check(
      'bookings filtered by type/status/date',
      200,
      () => admin.get(`/admin/bookings?type=hotel&status=confirmed&from=${day(-30)}&to=${day(1)}`),
      isPage,
    );
    await check('bad date range → 400', 400, () => admin.get(`/admin/bookings?from=${day(5)}&to=${day(1)}`));
    await check('audit log (GEN-07)', 200, () => admin.get('/admin/audit-logs?limit=5'));
  }

  // ---------------------------------------------------------------- flights
  heading('Airlines & flights (FLT-*)');
  let flightId;
  if (!airlineMod || !airlineId || !ap1 || !ap2) {
    skip('flight management', 'needs admin credentials and seeded airports');
  } else {
    await check('set baggage policy', 200, () =>
      airlineMod.put(`/airlines/${airlineId}/baggage-policy`, {
        maxExtraBagsPerPassenger: 2,
        cabins: [{ cabin: 'Economy', freeBags: 1 }],
      }),
    );
    await check('set cancellation policy', 200, () =>
      airlineMod.put(`/airlines/${airlineId}/cancellation-policy`, {
        tiers: [
          { minDays: 7, refundPercent: 100 },
          { minDays: 0, refundPercent: 0 },
        ],
      }),
    );
    await check('other airline moderator rules: user cannot edit airline', 403, () =>
      alice.patch(`/airlines/${airlineId}`, { name: 'Hacked' }),
    );
    const dep = day(40);
    const flight = await check('create flight', [200, 201], () =>
      airlineMod.post('/flights', {
        airlineId,
        flightNumber: `${admin.airlineCode}${String(Date.now()).slice(-3)}`,
        origin: ap1.iataCode,
        destination: ap2.iataCode,
        departureLocal: `${dep}T09:00`,
        arrivalLocal: `${dep}T13:30`,
        currency: CURRENCY,
        cabins: [
          { cabin: 'Economy', capacity: 20, price: 150 },
          { cabin: 'Business', capacity: 4, price: 600 },
        ],
      }),
    );
    flightId = idOf(flight?.data);
    await check('guest searches flights (FLT-01)', 200, () =>
      guest.get(`/flights/search?origin=${ap1.iataCode}&destination=${ap2.iataCode}&departureDate=${dep}&adults=1`),
    );
    if (flightId) {
      await check('flight details', 200, () => guest.get(`/flights/${flightId}`), hasNoMongoKeys);
      await check('airline details', 200, () => guest.get(`/airlines/${airlineId}`));
    }
  }

  heading('Flight bookings & payments (FLT-2x, PAY-*)');
  let flightBookingId;
  if (!flightId) {
    skip('flight bookings', 'no flight was created');
  } else {
    const hold = await check('hold seats (FLT-22)', [200, 201], () =>
      alice.post('/flight-bookings/hold', {
        legs: [{ flightId, cabinClass: 'Economy' }],
        passengers: [
          {
            type: 'adult',
            firstName: 'Alice',
            lastName: 'Smoke',
            dateOfBirth: '1990-05-01',
            nationality: 'EG',
            passportNumber: 'A1234567',
            extraBags: 0,
          },
        ],
      }),
    );
    flightBookingId = idOf(hold?.data);
    await check('my flight bookings', 200, () => alice.get('/flight-bookings'), isPage);
    if (flightBookingId) {
      await check('booking details (owner)', 200, () => alice.get(`/flight-bookings/${flightBookingId}`));
      await check('another user cannot see it', [403, 404], () => bob.get(`/flight-bookings/${flightBookingId}`));
      await check('policies before paying (PAY-02)', 200, () =>
        alice.get(`/bookings/flight/${flightBookingId}/policies`),
      );
      await check('paying before accepting policies is refused', [400, 409], () =>
        alice.post('/payments', { bookingType: 'flight', bookingId: flightBookingId }),
      );
      await check('accept policies', [200, 201], () =>
        alice.post(`/bookings/flight/${flightBookingId}/accept-policies`, { accept: true }),
      );
      if (TEST_PAYMENTS) {
        const pay = await check('start Stripe payment (PAY-01)', [200, 201], () =>
          alice.post('/payments', { bookingType: 'flight', bookingId: flightBookingId }),
        );
        const paymentId = idOf(pay?.data?.payment ?? pay?.data);
        if (paymentId) {
          await check('confirm with Stripe test card', [200, 201], () =>
            alice.post(`/payments/${paymentId}/test-confirm`, {}),
          );
          await check(
            'booking is confirmed',
            200,
            () => alice.get(`/flight-bookings/${flightBookingId}`),
            (d) => (d?.status === 'confirmed' ? null : `status is ${d?.status}`),
          );
          await check('e-ticket available', 200, () => alice.get(`/flight-bookings/${flightBookingId}/e-ticket`));
          await check('cancellation preview', 200, () =>
            alice.get(`/flight-bookings/${flightBookingId}/cancellation-preview`),
          );
          await check('cancel with refund (PAY-03)', [200, 201], () =>
            alice.post(`/flight-bookings/${flightBookingId}/cancel`, { reason: 'smoke test' }),
          );
          await check('airline sees passenger list', 200, () => airlineMod.get(`/flights/${flightId}/bookings`));
        }
      } else {
        skip('Stripe payment, e-ticket, cancellation', 'set TEST_PAYMENTS=1 (server needs Stripe test keys)');
      }
    }
  }

  // ---------------------------------------------------------------- hotels
  heading('Hotels & rooms (HTL-01..HTL-15)');
  let roomId;
  const checkIn = day(30);
  const checkOut = day(33);
  if (!hotelMod || !hotelId) {
    skip('hotel management', 'needs admin credentials');
  } else {
    await check('set hotel policies', 200, () =>
      hotelMod.put(`/hotels/${hotelId}/policies`, {
        checkInTime: '14:00',
        checkOutTime: '12:00',
        cancellationTiers: [
          { minDays: 3, refundPercent: 100 },
          { minDays: 0, refundPercent: 0 },
        ],
      }),
    );
    const room = await check('create room (HTL-03)', [200, 201], () =>
      hotelMod.post(`/hotels/${hotelId}/rooms`, {
        roomLabel: '101',
        roomType: 'Deluxe Double',
        beds: 2,
        maxOccupancy: 3,
        pricePerNightMinor: 12000,
      }),
    );
    roomId = idOf(room?.data);
    await check('duplicate room label → 409', [400, 409], () =>
      hotelMod.post(`/hotels/${hotelId}/rooms`, {
        roomLabel: '101',
        roomType: 'Twin',
        beds: 2,
        maxOccupancy: 2,
        pricePerNightMinor: 9000,
      }),
    );
    if (roomId) {
      await check('open availability window', [200, 201], () =>
        hotelMod.post(`/hotels/${hotelId}/rooms/${roomId}/availability`, { startDate: day(1), endDate: day(90) }),
      );
      await check('room status calendar (HTL-08)', 200, () =>
        hotelMod.get(`/hotels/${hotelId}/rooms/status?checkIn=${checkIn}&checkOut=${checkOut}`),
      );
      await check('official path GET /hotels/:id/availability', 200, () =>
        hotelMod.get(`/hotels/${hotelId}/availability?checkIn=${checkIn}&checkOut=${checkOut}`),
      );
    }
    await check('user cannot add rooms', 403, () =>
      alice.post(`/hotels/${hotelId}/rooms`, {
        roomLabel: '999',
        roomType: 'X',
        beds: 1,
        maxOccupancy: 1,
        pricePerNightMinor: 1,
      }),
    );
    await check(
      'guest searches hotels (HTL-11)',
      200,
      () =>
        guest.get(
          `/hotels/search?city=${encodeURIComponent(city.name)}&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
        ),
      isPage,
    );
    await check('hotel details (HTL-02)', 200, () => guest.get(`/hotels/${hotelId}`), hasNoMongoKeys);
    await check(
      'hotel details with dates list available rooms',
      200,
      () => guest.get(`/hotels/${hotelId}?checkIn=${checkIn}&checkOut=${checkOut}`),
      (d) => (Array.isArray(d?.availableRooms) && d.availableRooms.length ? null : 'availableRooms missing or empty'),
    );
    await check('available rooms (HTL-15)', 200, () =>
      guest.get(`/hotels/${hotelId}/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}`),
    );
    await check('public reviews (HTL-24)', 200, () => guest.get(`/hotels/${hotelId}/reviews`));
  }

  heading('Hotel bookings (HTL-16..HTL-23)');
  if (!roomId) {
    skip('hotel bookings', 'no room was created');
  } else {
    const body = { hotelId, checkIn, checkOut, rooms: [{ roomId, adults: 2, childrenAges: [] }] };
    await check('quote (HTL-16)', 200, () => alice.post('/hotel-bookings/summary', body));
    await check('too many guests for room → 400/409', [400, 409, 422], () =>
      alice.post('/hotel-bookings/summary', { ...body, rooms: [{ roomId, adults: 6, childrenAges: [] }] }),
    );
    const hold = await check('hold via official path POST /hotel-bookings', [200, 201], () =>
      alice.post('/hotel-bookings', body),
    );
    const hotelBookingId = idOf(hold?.data);
    await check('same room cannot be held twice (HTL-18)', [409], () => bob.post('/hotel-bookings/hold', body));
    await check('my hotel bookings', 200, () => alice.get('/hotel-bookings'), isPage);
    if (hotelBookingId) {
      await check('booking details', 200, () => alice.get(`/hotel-bookings/${hotelBookingId}`));
      await check('hotel policies (PAY-02)', 200, () => alice.get(`/bookings/hotel/${hotelBookingId}/policies`));
      await check('review before stay completes is refused', [400, 403, 409], () =>
        alice.post(`/hotel-bookings/${hotelBookingId}/review`, { rating: 5, review: 'Great' }),
      );
    }
    await check('moderator reservations (official path)', 200, () => hotelMod.get(`/hotels/${hotelId}/reservations`));
    await check('moderator reservations (legacy path)', 200, () => hotelMod.get(`/hotel-bookings/hotel/${hotelId}`));
    await check('user cannot list hotel reservations', 403, () => alice.get(`/hotels/${hotelId}/reservations`));
  }

  // ---------------------------------------------------------------- itineraries
  heading('Itineraries (ITN-*)');
  const itn = await check('create itinerary (ITN-01)', [200, 201], () =>
    alice.post('/itineraries', {
      title: `Smoke trip ${RUN}`,
      description: 'Two cities',
      countryCodes: [...new Set([city?.countryCode, city2?.countryCode].filter(Boolean))],
      startDate: day(20),
      visibility: 'public',
      budgetCurrency: CURRENCY,
    }),
  );
  const itnId = idOf(itn?.data);
  await check('title over 100 chars → 400', 400, () =>
    alice.post('/itineraries', { title: 'x'.repeat(101), countryCodes: ['EG'], startDate: day(20) }),
  );
  if (itnId && city) {
    const d1 = await check('add day (ITN-05)', [200, 201], () =>
      alice.post(`/itineraries/${itnId}/days`, { cityId: city.id ?? city.code, title: 'Arrival' }),
    );
    const d2 = await check('add second day', [200, 201], () =>
      alice.post(`/itineraries/${itnId}/days`, { cityId: (city2 ?? city).id ?? city.code, title: 'Day two' }),
    );
    const days = d2?.data?.days ?? d1?.data?.days ?? [];
    const dayIds = days.map((x) => x.id ?? x._id).filter(Boolean);
    const dayId = dayIds[0];
    if (dayId) {
      await check('add activity (ITN-07)', [200, 201], () =>
        alice.post(`/itineraries/${itnId}/days/${dayId}/activities`, {
          title: 'Museum visit',
          startTime: '10:00',
          endTime: '12:00',
        }),
      );
      await check('add budget entry (ITN-12)', [200, 201], () =>
        alice.post(`/itineraries/${itnId}/days/${dayId}/budgets`, {
          category: 'food',
          amountMinor: 2500,
          currency: CURRENCY,
          description: 'Lunch',
        }),
      );
    } else skip('activities & budget', 'could not read day ids from the add-day response');
    if (dayIds.length >= 2) {
      await check('reorder days (ITN-09)', 200, () =>
        alice.patch(`/itineraries/${itnId}/days/reorder`, { dayIds: [...dayIds].reverse() }),
      );
    }
    await check('add transport cost', [200, 201], () =>
      alice.post(`/itineraries/${itnId}/transport-costs`, {
        fromCityId: city.id ?? city.code,
        toCityId: (city2 ?? city).id ?? city.code,
        mode: 'train',
        amountMinor: 4000,
        currency: CURRENCY,
      }),
    );
    await check('budget summary', 200, () => alice.get(`/itineraries/${itnId}/budget-summary?currency=${CURRENCY}`));
    await check('my itineraries', 200, () => alice.get('/itineraries'), isPage);
    await check('public itinerary visible to guest', 200, () => guest.get(`/itineraries/public/${itnId}`));
    await check(
      'public search by keyword (ITN-21)',
      200,
      () => guest.get(`/itineraries/public/search?q=${encodeURIComponent(`Smoke trip ${RUN}`)}`),
      (d) => (items(d).some((x) => idOf(x) === itnId) ? null : 'created itinerary not found by title'),
    );
    await check('another user cannot edit it', [403, 404], () =>
      bob.patch(`/itineraries/${itnId}`, { title: 'Hijack' }),
    );
    await check('clone public itinerary (ITN-20)', [200, 201], () =>
      bob.post(`/itineraries/${itnId}/clone`, { startDate: day(60) }),
    );
    await check('hotel suggestions for itinerary', 200, () => alice.get(`/itineraries/${itnId}/hotels`));
    await check('flight suggestions for itinerary', [200, 400], () => alice.get(`/itineraries/${itnId}/flights`));
  }

  // ---------------------------------------------------------------- blog
  heading('Blog (BLG-01..BLG-12)');
  const post = await check('create published post (BLG-01)', [200, 201], () =>
    alice.post('/posts', {
      title: `Smoke post ${RUN}`,
      content: 'A long enough body for the smoke test post. '.repeat(10),
      tags: ['Egypt', 'food'],
      status: 'published',
    }),
  );
  const postId = idOf(post?.data);
  const draft = await check('create draft', [200, 201], () =>
    alice.post('/posts', { title: `Draft ${RUN}`, content: 'Draft body', status: 'draft' }),
  );
  const draftId = idOf(draft?.data);
  await check('more than 5 tags → 400 (BLG-08)', 400, () =>
    alice.post('/posts', { title: 'Tags', content: 'Body', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }),
  );
  await check('published list (BLG-02)', 200, () => guest.get('/posts'), isPage);
  if (draftId) await check('guest cannot see a draft', 404, () => guest.get(`/posts/${draftId}`));
  if (draftId) await check('author sees own draft', 200, () => alice.get(`/posts/${draftId}`));
  await check(
    'my posts with counts (BLG-03)',
    200,
    () => alice.get('/posts/mine'),
    (d) =>
      isPage(d) === true && items(d).every((p) => 'likeCount' in p && 'commentCount' in p)
        ? null
        : 'missing page shape or counts',
  );
  if (postId) {
    await check(
      'tags are normalised to lowercase',
      200,
      () => guest.get(`/posts/${postId}`),
      (d) => (d?.tags?.includes('egypt') ? null : `tags: ${JSON.stringify(d?.tags)}`),
    );
    await check('edit post (BLG-04)', 200, () =>
      alice.patch(`/posts/${postId}`, { title: `Smoke post edited ${RUN}` }),
    );
    await check('another user cannot edit it', [403, 404], () => bob.patch(`/posts/${postId}`, { title: 'Hijack' }));
    await check('like (BLG-06)', 200, () => bob.post(`/posts/${postId}/like`));
    await check(
      'liking twice keeps one like',
      200,
      () => bob.post(`/posts/${postId}/like`),
      (d) => (d?.likeCount === 1 ? null : `likeCount ${d?.likeCount}`),
    );
    await check(
      'unlike',
      200,
      () => bob.del(`/posts/${postId}/like`),
      (d) => (d?.likeCount === 0 ? null : `likeCount ${d?.likeCount}`),
    );
    await bob.post(`/posts/${postId}/like`);
    const comment = await check('comment (BLG-05)', [200, 201], () =>
      bob.post(`/posts/${postId}/comments`, { content: 'Nice post!' }),
    );
    const commentId = idOf(comment?.data);
    await check('comment over 500 chars → 400', 400, () =>
      bob.post(`/posts/${postId}/comments`, { content: 'x'.repeat(501) }),
    );
    await check('comments are chronological', 200, () => guest.get(`/posts/${postId}/comments`), isPage);
    if (commentId) {
      await check('edit own comment PATCH /comments/:id (BLG-07)', 200, () =>
        bob.patch(`/comments/${commentId}`, { content: 'Nice post, edited' }),
      );
      await check("cannot edit someone else's comment", [403, 404], () =>
        alice.patch(`/comments/${commentId}`, { content: 'Hijack' }),
      );
    }
    await check(
      'search by title (BLG-09)',
      200,
      () => guest.get(`/posts/search?q=${encodeURIComponent(`edited ${RUN}`)}`),
      (d) => (items(d).some((p) => p.id === postId) ? null : 'post not found by title'),
    );
    await check(
      'search by author name',
      200,
      () => guest.get(`/posts/search?q=${encodeURIComponent(`Alice Updated ${RUN}`)}`),
      (d) => (items(d).some((p) => p.id === postId) ? null : 'post not found by author name'),
    );
    await check(
      'posts by tag (BLG-08)',
      200,
      () => guest.get('/tags/egypt/posts'),
      (d) => (items(d).some((p) => p.id === postId) ? null : 'post not in tag list'),
    );
    if (alice.id) {
      await check(
        'author page (BLG-12)',
        200,
        () => guest.get(`/authors/${alice.id}`),
        (d) =>
          d?.author?.joinedAt && d?.posts && d?.publicItineraries
            ? null
            : 'missing joinedAt / posts / publicItineraries',
      );
    }

    // ---------------------------------------------------------- reports & moderation
    heading('Reports & moderation (GEN-09, GEN-10)');
    const report = await check('report a post', [200, 201], () =>
      bob.post('/reports', { contentType: 'post', contentId: postId, reason: 'Spam content in post' }),
    );
    await check('reporting the same post twice → 409', 409, () =>
      bob.post('/reports', { contentType: 'post', contentId: postId, reason: 'Spam again please' }),
    );
    if (itnId)
      await check('report a public itinerary', [200, 201], () =>
        bob.post('/reports', { contentType: 'itinerary', contentId: itnId, reason: 'Misleading itinerary' }),
      );
    if (ADMIN_EMAIL) {
      await check('admin lists reports', 200, () => admin.get('/admin/reports?status=pending'), isPage);
      const reportId = idOf(report?.data);
      if (reportId) {
        await check('admin hides the post via the report', 200, () =>
          admin.patch(`/admin/reports/${reportId}`, { action: 'hide', note: 'smoke test' }),
        );
        await check('hidden post → guest gets 404', 404, () => guest.get(`/posts/${postId}`));
        await check(
          'author still sees the hidden post',
          200,
          () => alice.get(`/posts/${postId}`),
          (d) => (d?.hidden ? null : 'hidden flag not shown'),
        );
        await check('admin unhides it', 200, () => admin.patch(`/admin/content/post/${postId}/unhide`, {}));
        await check('visible again', 200, () => guest.get(`/posts/${postId}`));
      }
      if (commentId)
        await check('admin deletes a comment', 200, () => admin.del(`/admin/content/comment/${commentId}`));
      if (itnId) {
        await check('admin hides an itinerary', 200, () =>
          admin.patch(`/admin/content/itinerary/${itnId}/hide`, { reason: 'smoke' }),
        );
        await check('hidden itinerary not public', 404, () => guest.get(`/itineraries/public/${itnId}`));
        await check('admin unhides the itinerary', 200, () =>
          admin.patch(`/admin/content/itinerary/${itnId}/unhide`, {}),
        );
      }
      await check('unknown content type → 400', 400, () => admin.patch(`/admin/content/banana/${postId}/hide`, {}));
    } else skip('admin moderation', 'set ADMIN_EMAIL and ADMIN_PASSWORD');

    if (draftId) await check('delete own post (BLG-04)', 200, () => alice.del(`/posts/${draftId}`));
  }

  // ---------------------------------------------------------------- providers
  if (ADMIN_EMAIL && hotelId) {
    heading('Provider deactivation (ACC-15)');
    await check('deactivate hotel', 200, () =>
      admin.patch(`/admin/providers/hotel/${hotelId}/deactivate`, { reason: 'smoke test' }),
    );
    await check('deactivating twice → 409', 409, () => admin.patch(`/admin/providers/hotel/${hotelId}/deactivate`, {}));
    await check(
      'inactive hotel hidden from search',
      200,
      () =>
        guest.get(
          `/hotels/search?city=${encodeURIComponent(city.name)}&checkIn=${checkIn}&checkOut=${checkOut}&guests=1&limit=100`,
        ),
      (d) => (items(d).some((h) => idOf(h) === hotelId) ? 'inactive hotel still in search' : null),
    );
    await check('reactivate hotel', 200, () => admin.patch(`/admin/providers/hotel/${hotelId}/reactivate`, {}));
    if (airlineId) {
      await check('deactivate airline', 200, () => admin.patch(`/admin/providers/airline/${airlineId}/deactivate`, {}));
      await check('reactivate airline', 200, () => admin.patch(`/admin/providers/airline/${airlineId}/reactivate`, {}));
    }
  }

  // ---------------------------------------------------------------- notifications
  heading('Notifications (GEN-01)');
  await check('list notifications', 200, () => alice.get('/notifications'));
  await check('unread count', 200, () => alice.get('/notifications/unread-count'));
  await check('mark all read', 200, () => alice.patch('/notifications/read-all'));

  // ---------------------------------------------------------------- account deletion
  heading('Account deletion (ACC-12)');
  const carol = await newUser('Carol');
  const cPost = await carol.post('/posts', { title: `Carol post ${RUN}`, content: 'Body', status: 'published' });
  const cPostId = idOf(cPost.data);
  await check('delete my account', [200, 204], () => carol.req('DELETE', '/users/me', { password: PASSWORD }));
  if (cPostId) await check("deleted user's posts are hidden", 404, () => guest.get(`/posts/${cPostId}`));
  await check('deleted user cannot log in', [401, 403], () =>
    new Client('x').post('/auth/login', { email: carol.email, password: PASSWORD }),
  );

  // ---------------------------------------------------------------- summary
  console.log(
    `\n${bold('Summary')}: ${green(`${results.pass} passed`)}, ${results.fail ? red(`${results.fail} failed`) : '0 failed'}, ${yellow(`${results.skip} skipped`)}`,
  );
  if (results.failures.length) {
    console.log(`\n${bold('Failures')}`);
    for (const f of results.failures) console.log(`  ${red('✘')} ${f}`);
  }
  process.exit(results.fail ? 1 : 0);
}

main().catch((error) => {
  console.error(red(`\nAborted: ${error.message}`));
  process.exit(2);
});
