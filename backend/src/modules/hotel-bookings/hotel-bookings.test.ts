import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { BookingStatus, Role } from '../../common/constants/enums';
import { ROLES_KEY } from '../../common/decorators';
import { buildValidationPipe } from '../../common/pipes/validation';
import {
  anyLiveRoomReservationMatch,
  hasLiveRoomReservation,
  liveRoomReservationMatch,
} from '../hotels/room-reservation.logic';
import { RoomSchema } from '../hotels/schemas/room.schema';
import { CreateHotelBookingDto } from './dto/hotel-booking.dto';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBookingSchema } from './schemas/hotel-booking.schema';

const hotelId = '507f1f77bcf86cd799439011';
const roomId = '507f1f77bcf86cd799439012';
const secondRoomId = '507f1f77bcf86cd799439013';
const userId = '507f1f77bcf86cd799439014';
const user: any = { id: userId, role: Role.User };
const dto: CreateHotelBookingDto = {
  hotelId,
  checkIn: '2027-02-01',
  checkOut: '2027-02-03',
  rooms: [
    { roomId, adults: 2, childrenAges: [7] },
    { roomId: secondRoomId, adults: 0, childrenAges: [15] },
  ],
} as any;

const room = (id: string, occupancy: number, price: number) => ({
  _id: new Types.ObjectId(id),
  hotelId: new Types.ObjectId(hotelId),
  roomLabel: id === roomId ? '101' : '102',
  roomType: 'Standard',
  status: 'active',
  maxOccupancy: occupancy,
  pricePerNightMinor: price,
  availabilityRanges: [{ startDate: '2027-01-01', endDate: '2027-03-01' }],
  blockedRanges: [],
  reservationLocks: [],
});

function bookingService(override: { rooms?: any[]; hotel?: any } = {}) {
  const calls: any[] = [];
  const rooms = override.rooms ?? [room(roomId, 3, 10000), room(secondRoomId, 2, 20000)];
  const hotel = override.hotel ?? {
    _id: new Types.ObjectId(hotelId),
    name: 'Example Hotel',
    status: 'active',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    cancellationTiers: [{ minDays: 7, refundPercent: 100 }],
  };
  const inventory: any = {
    getHotel: async () => hotel,
    getRooms: async (_hotelId: string, selectedIds: string[]) =>
      rooms.filter((room: any) => selectedIds.includes(String(room._id))),
    isScheduleAvailable: (r: any, start: string, end: string) =>
      r.status === 'active' &&
      r.availabilityRanges.some((range: any) => range.startDate <= start && range.endDate >= end),
    reserve: async (_hotel: string, id: string) => {
      calls.push(['reserve', id]);
      return true;
    },
    confirm: async () => true,
    release: async () => undefined,
  };
  const connection: any = { transaction: async (cb: any) => cb({ id: 'mock-session' }) };
  const model: any = {
    create: async (docs: any[]) => {
      calls.push(['createBooking', docs[0]]);
      return [{ ...docs[0], status: BookingStatus.PendingPayment }];
    },
  };
  const config: any = { get: () => 'USD' };
  const service = new HotelBookingsService(
    model,
    connection,
    inventory,
    config,
    {} as any,
    { notify: async () => {} } as any,
    {} as any,
    {} as any,
  );
  return { service, calls };
}

test('HTL-16: booking DTO validates per-room adult/child assignments', async () => {
  const pipe = buildValidationPipe();
  const meta: any = { type: 'body', metatype: CreateHotelBookingDto };
  const valid = await pipe.transform(dto, meta);
  assert.equal(valid.rooms.length, 2);
  assert.equal(valid.rooms[0].childrenAges[0], 7);
  for (const input of [
    { ...dto, rooms: [] },
    { ...dto, hotelId: 'not-an-id' },
    { ...dto, extra: true },
    { ...dto, rooms: [{ ...dto.rooms[0], adults: -1 }] },
    { ...dto, rooms: [{ ...dto.rooms[0], adults: 2.3 }] },
    { ...dto, rooms: [{ ...dto.rooms[0], childrenAges: [18] }] },
    { ...dto, rooms: [{ ...dto.rooms[0], childrenAges: [-1] }] },
    { ...dto, rooms: [{ ...dto.rooms[0], childrenAges: ['nine'] }] },
    { ...dto, rooms: [{ ...dto.rooms[0], unexpected: true }] },
  ]) {
    await assert.rejects(pipe.transform(input, meta));
  }
});

test('HTL-16: quote snapshots rates and policies; total is rooms × nights', async () => {
  const { service } = bookingService();
  const summary = await service.summary(user, dto);
  assert.equal(summary.nights, 2);
  assert.equal(summary.guestCount, 4);
  assert.equal(summary.totalMinor, 60000);
  assert.equal(summary.currency, 'USD');
  assert.equal(summary.rooms[0].totalMinor, 20000);
  assert.equal(summary.rooms[1].totalMinor, 40000);
  assert.equal(summary.inventoryHeld, false);
  assert.equal(summary.cancellationTiers[0].refundPercent, 100);
});

test('HTL-16: reject duplicate rooms and missing adult', async () => {
  const { service } = bookingService();
  await assert.rejects(service.summary(user, { ...dto, rooms: [dto.rooms[0], dto.rooms[0]] }));
  await assert.rejects(
    service.summary(user, {
      ...dto,
      rooms: [{ roomId, adults: 0, childrenAges: [2] }],
    }),
    /At least one adult/,
  );
});

test('HTL-16: reject occupants above per-room capacity and empty room', async () => {
  const { service } = bookingService();
  await assert.rejects(
    service.summary(user, {
      ...dto,
      rooms: [{ roomId: secondRoomId, adults: 3, childrenAges: [] }],
    }),
    /at most 2/,
  );
  await assert.rejects(
    service.summary(user, {
      ...dto,
      rooms: [
        { roomId, adults: 1, childrenAges: [] },
        { roomId: secondRoomId, adults: 0, childrenAges: [] },
      ],
    }),
    /at least one guest/,
  );
});

test('HTL-16: reject inactive hotel, mixed-hotel room, blocks, or active holds', async () => {
  await assert.rejects(bookingService({ hotel: { status: 'inactive' } }).service.summary(user, dto));
  await assert.rejects(bookingService({ rooms: [room(roomId, 3, 10000)] }).service.summary(user, dto));
  const blocked = room(roomId, 3, 10000);
  blocked.blockedRanges.push({ startDate: '2027-02-01', endDate: '2027-02-04' });
  const { service } = bookingService({ rooms: [blocked, room(secondRoomId, 2, 20000)] });
  // Use real schedule helper instead of the minimal mocked one for this scenario.
  (service as any).inventory.isScheduleAvailable = (r: any, start: string, end: string) =>
    r.status === 'active' && !r.blockedRanges.some((b: any) => b.startDate < end && b.endDate > start);
  await assert.rejects(service.summary(user, dto));
});

test('HTL-18: create hold claims both rooms before creating one pending booking', async () => {
  const { service, calls } = bookingService();
  const hold = await service.createHold(user, dto);
  assert.equal(hold.status, BookingStatus.PendingPayment);
  assert.equal(hold.totalMinor, 60000);
  assert.match(hold.reference, /^HTL-[A-Z2-9]{8}$/);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['reserve', 'reserve', 'createBooking'],
  );
  assert.ok(new Date(hold.holdExpiresAt).getTime() > Date.now());
});

test('HTL-16: only a registered traveller can quote or place a hold', async () => {
  const { service } = bookingService();
  await assert.rejects(service.summary({ ...user, role: Role.HotelModerator }, dto));
  await assert.rejects(service.createHold({ ...user, role: Role.Admin }, dto));
});

test('HTL-18: active confirmed or unexpired locks conflict, expired and adjacent locks do not', () => {
  const now = new Date('2027-01-01T00:00:00Z');
  const base = { bookingId: new Types.ObjectId(), startDate: '2027-02-01', endDate: '2027-02-04' };
  assert.equal(
    hasLiveRoomReservation(
      [{ ...base, status: BookingStatus.Confirmed, expiresAt: new Date('2026-01-01') }],
      '2027-02-02',
      '2027-02-03',
      now,
    ),
    true,
  );
  assert.equal(
    hasLiveRoomReservation(
      [{ ...base, status: BookingStatus.PendingPayment, expiresAt: new Date('2027-01-02') }],
      '2027-02-02',
      '2027-02-03',
      now,
    ),
    true,
  );
  assert.equal(
    hasLiveRoomReservation(
      [{ ...base, status: BookingStatus.PendingPayment, expiresAt: new Date('2026-12-31') }],
      '2027-02-02',
      '2027-02-03',
      now,
    ),
    false,
  );
  assert.equal(
    hasLiveRoomReservation(
      [{ ...base, status: BookingStatus.Confirmed, expiresAt: now }],
      '2027-02-04',
      '2027-02-05',
      now,
    ),
    false,
  );
  assert.ok(liveRoomReservationMatch('2027-02-01', '2027-02-02', now).$or.length === 2);
  assert.ok(anyLiveRoomReservationMatch(now).$or.length === 2);
});

test('HTL-17/18: schemas include correct ObjectId references and indexes', () => {
  assert.equal(HotelBookingSchema.path('userId').instance, 'ObjectId');
  assert.equal(HotelBookingSchema.path('hotelId').instance, 'ObjectId');
  assert.equal(RoomSchema.path('hotelId').instance, 'ObjectId');
  assert.ok((RoomSchema.path('reservationLocks') as any).schema.path('bookingId').instance === 'ObjectId');
  assert.ok(HotelBookingSchema.indexes().some(([paths]) => paths.status === 1 && paths.holdExpiresAt === 1));
});

test('HTL-16/17: routes are protected and expose quote, hold, confirmation page', () => {
  for (const [name, path, method] of [
    ['summary', 'summary', RequestMethod.POST],
    ['hold', 'hold', RequestMethod.POST],
    ['getOne', ':id', RequestMethod.GET],
  ] as const) {
    const handler = HotelBookingsController.prototype[name];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method);
  }
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, HotelBookingsController.prototype.summary), [Role.User]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, HotelBookingsController.prototype.hold), [Role.User]);
});

test('HTL-20: booking history is owner-scoped, grouped and paginated', async () => {
  const booking: any = {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(userId),
    hotelId: new Types.ObjectId(hotelId),
    reference: 'HTL-TEST1234',
    hotelName: 'Example Hotel',
    status: BookingStatus.Confirmed,
    checkIn: '2027-02-01',
    checkOut: '2027-02-03',
    nights: 2,
    rooms: [
      {
        roomId: new Types.ObjectId(roomId),
        roomLabel: '101',
        roomType: 'Standard',
        adults: 2,
        childrenAges: [],
        maxOccupancy: 3,
        pricePerNightMinor: 10000,
        totalMinor: 20000,
      },
    ],
    guestCount: 2,
    totalMinor: 20000,
    currency: 'USD',
    holdExpiresAt: new Date('2027-01-01'),
  };

  let filter: any;
  let skipped = 0;

  const chain: any = {
    sort() { return this; },
    skip(n: number) { skipped = n; return this; },
    limit() { return this; },
    lean() { return this; },
    exec: async () => [booking],
  };

  const model: any = {
    find(query: any) {
      filter = query;
      return chain;
    },
    countDocuments() {
      return { exec: async () => 1 };
    },
  };

  const service = new HotelBookingsService(
    model,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const upcoming = await service.list(user, {
    scope: 'upcoming',
    page: 2,
    limit: 3,
  });

  assert.equal(String(filter.userId), userId);
  assert.deepEqual(filter.$and[1].status.$in, [
    BookingStatus.PendingPayment,
    BookingStatus.Confirmed,
  ]);
  assert.equal(skipped, 3);
  assert.equal(upcoming.total, 1);
  assert.equal(upcoming.page, 2);
  assert.equal(upcoming.items[0].reference, 'HTL-TEST1234');
  assert.equal(upcoming.items[0].rooms[0].roomId, roomId);

  await service.list(user, { scope: 'past' });
  assert.ok(
    filter.$and[0].$or.some(
      (condition: any) =>
        condition.status === BookingStatus.Completed,
    ),
  );

  await service.list(user, { scope: 'cancelled' });
  assert.equal(filter.status, BookingStatus.Cancelled);
  assert.equal(String(filter.userId), userId);

  await assert.rejects(
    service.list({ ...user, role: Role.HotelModerator }, {}),
  );

  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      HotelBookingsController.prototype.list,
    ),
    RequestMethod.GET,
  );
  assert.deepEqual(
    Reflect.getMetadata(
      ROLES_KEY,
      HotelBookingsController.prototype.list,
    ),
    [Role.User],
  );
});
