import 'reflect-metadata';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildValidationPipe } from '../../common/pipes/validation';
import { CreateRoomAvailabilityDto, CreateRoomDto } from './dto/rooms.dto';
import { RoomsService } from './rooms.service';
import { RoomSchema } from './schemas/room.schema';

const hotelId = '507f1f77bcf86cd799439011';
const otherHotelId = '507f1f77bcf86cd799439012';
const roomId = '507f1f77bcf86cd799439013';

const moderator: any = {
  id: '507f1f77bcf86cd799439014',
  role: 'hotel_moderator',
  moderatorAssignment: {
    providerType: 'hotel',
    providerId: hotelId,
  },
};

const admin: any = {
  id: '507f1f77bcf86cd799439015',
  role: 'admin',
};

const validRoom: CreateRoomDto = {
  roomLabel: '101',
  roomType: 'Deluxe Double',
  beds: 2,
  maxOccupancy: 3,
  pricePerNightMinor: 25000,
};

function fixture(
  options: {
    hotelExists?: boolean;
    duplicateExists?: boolean;
    duplicateOnInsert?: boolean;
  } = {},
) {
  const calls: any[] = [];

  const hotels: any = {
    findById: (id: string) => ({
      exec: async () => {
        calls.push(['findHotel', id]);

        return options.hotelExists === false ? null : { _id: hotelId };
      },
    }),
  };

  const rooms: any = {
    exists: (filter: any) => ({
      exec: async () => {
        calls.push(['checkDuplicate', filter]);

        return options.duplicateExists ? { _id: roomId } : null;
      },
    }),

    create: async (data: any) => {
      calls.push(['createRoom', data]);

      if (options.duplicateOnInsert) {
        const error: any = new Error('Duplicate key');
        error.code = 11000;
        throw error;
      }

      return {
        _id: roomId,
        ...data,
        status: 'active',
      };
    },
  };

  return {
    service: new RoomsService(rooms, hotels),
    calls,
  };
}

test('HTL-03: Assigned moderator creates a room', async () => {
  const { service, calls } = fixture();

  const result = await service.createRoom(moderator, hotelId, validRoom);

  assert.equal(result.id, roomId);
  assert.equal(result.hotelId, hotelId);
  assert.equal(result.roomLabel, '101');
  assert.equal(result.beds, 2);
  assert.equal(result.maxOccupancy, 3);
  assert.equal(result.pricePerNightMinor, 25000);
  assert.equal(result.status, 'active');

  assert.ok(calls.some((call) => call[0] === 'createRoom'));
});

test('HTL-03: Moderator cannot manage another hotel', async () => {
  const { service, calls } = fixture();

  await assert.rejects(service.createRoom(moderator, otherHotelId, validRoom), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-03: Administrator cannot use moderator room creation', async () => {
  const { service, calls } = fixture();

  await assert.rejects(service.createRoom(admin, hotelId, validRoom), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-03: Unknown hotel is rejected', async () => {
  const { service } = fixture({ hotelExists: false });

  await assert.rejects(service.createRoom(moderator, hotelId, validRoom), /Hotel not found/);
});

test('HTL-03: Duplicate room label is rejected', async () => {
  const { service, calls } = fixture({
    duplicateExists: true,
  });

  await assert.rejects(service.createRoom(moderator, hotelId, validRoom), /already exists/);

  assert.equal(
    calls.some((call) => call[0] === 'createRoom'),
    false,
  );
});

test('HTL-03: Database duplicate-key error is handled', async () => {
  const { service } = fixture({
    duplicateOnInsert: true,
  });

  await assert.rejects(service.createRoom(moderator, hotelId, validRoom), /already exists/);
});

test('HTL-03: Invalid room data is rejected', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: CreateRoomDto,
  };

  const invalidRooms = [
    { ...validRoom, beds: 0 },
    { ...validRoom, beds: 1.5 },
    { ...validRoom, maxOccupancy: 0 },
    { ...validRoom, pricePerNightMinor: 0 },
    { ...validRoom, pricePerNightMinor: -100 },
    { ...validRoom, roomLabel: '   ' },
    { ...validRoom, unexpectedField: true },
  ];

  for (const room of invalidRooms) {
    await assert.rejects(pipe.transform(room, metadata));
  }

  const valid = await pipe.transform(validRoom, metadata);

  assert.equal(valid.roomLabel, '101');
});

test('HTL-03: Room labels are unique within a hotel', () => {
  const indexes = RoomSchema.indexes();

  const uniqueIndex = indexes.find(
    ([fields, options]) => fields.hotelId === 1 && fields.roomKey === 1 && options.unique === true,
  );

  assert.ok(uniqueIndex, 'Expected unique index on hotelId and roomKey');
});

/**
 * HTL-04 test fixture.
 *
 * Simulates an atomic MongoDB update without
 * modifying the real shared Atlas database.
 */
type TestRange = {
  startDate: string;
  endDate: string;
};

function availabilityFixture(initialRanges: TestRange[] = [], roomExists = true) {
  const ranges = [...initialRanges];
  const calls: any[] = [];

  const rooms: any = {
    findOneAndUpdate: (filter: any, update: any, options: any) => ({
      exec: async () => {
        calls.push({
          operation: 'update',
          filter,
          update,
          options,
        });

        if (!roomExists) {
          return null;
        }

        const next: TestRange = update.$push.availabilityRanges;

        const overlaps = ranges.some(
          (existing) => existing.startDate < next.endDate && existing.endDate > next.startDate,
        );

        if (overlaps) {
          return null;
        }

        ranges.push({ ...next });

        return {
          _id: roomId,
          hotelId,
          availabilityRanges: ranges.map((range) => ({ ...range })),
        };
      },
    }),

    exists: (filter: any) => ({
      exec: async () => {
        calls.push({
          operation: 'exists',
          filter,
        });

        return roomExists ? { _id: roomId } : null;
      },
    }),
  };

  return {
    service: new RoomsService(rooms, {} as any),
    calls,
    ranges,
  };
}

const firstRange: CreateRoomAvailabilityDto = {
  startDate: '2026-12-01',
  endDate: '2026-12-10',
};

test('HTL-04: Moderator adds room availability', async () => {
  const { service } = availabilityFixture();

  const result = await service.addAvailability(moderator, hotelId, roomId, firstRange);

  assert.equal(result.roomId, roomId);
  assert.equal(result.hotelId, hotelId);

  assert.deepEqual(result.availabilityRanges, [firstRange]);
});

test('HTL-04: Availability uses an atomic conditional update', async () => {
  const { service, calls } = availabilityFixture();

  await service.addAvailability(moderator, hotelId, roomId, firstRange);

  const call = calls.find((item) => item.operation === 'update');

  assert.ok(call);

  assert.equal(call.filter._id, roomId);
  assert.equal(String(call.filter.hotelId), hotelId);

  assert.deepEqual(call.filter.availabilityRanges, {
    $not: {
      $elemMatch: {
        startDate: { $lt: firstRange.endDate },
        endDate: { $gt: firstRange.startDate },
      },
    },
  });

  assert.equal(call.options.new, true);
  assert.equal(call.options.runValidators, true);

  assert.deepEqual(call.update.$push.availabilityRanges, firstRange);
});

test('HTL-04: Overlapping ranges are rejected', async () => {
  const invalidRanges = [
    {
      startDate: '2026-12-05',
      endDate: '2026-12-15',
    },
    {
      startDate: '2026-11-25',
      endDate: '2026-12-05',
    },
    {
      startDate: '2026-12-01',
      endDate: '2026-12-10',
    },
    {
      startDate: '2026-12-03',
      endDate: '2026-12-07',
    },
  ];

  for (const range of invalidRanges) {
    const { service, ranges } = availabilityFixture([firstRange]);

    await assert.rejects(service.addAvailability(moderator, hotelId, roomId, range), /overlaps an existing range/);

    assert.deepEqual(ranges, [firstRange]);
  }
});

test('HTL-04: Adjacent date ranges are allowed', async () => {
  const { service } = availabilityFixture([firstRange]);

  const secondRange = {
    startDate: '2026-12-10',
    endDate: '2026-12-20',
  };

  const result = await service.addAvailability(moderator, hotelId, roomId, secondRange);

  assert.deepEqual(result.availabilityRanges, [firstRange, secondRange]);
});

test('HTL-04: Availability ranges are returned chronologically', async () => {
  const laterRange = {
    startDate: '2026-12-20',
    endDate: '2026-12-25',
  };

  const { service } = availabilityFixture([laterRange]);

  const result = await service.addAvailability(moderator, hotelId, roomId, firstRange);

  assert.deepEqual(result.availabilityRanges, [firstRange, laterRange]);
});

test('HTL-04: Moderator cannot manage another hotel', async () => {
  const { service, calls } = availabilityFixture();

  await assert.rejects(service.addAvailability(moderator, otherHotelId, roomId, firstRange), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-04: Unknown room is rejected', async () => {
  const { service } = availabilityFixture([], false);

  await assert.rejects(service.addAvailability(moderator, hotelId, roomId, firstRange), /Room not found in this hotel/);
});

test('HTL-04: Invalid calendar ranges are rejected', async () => {
  const { service, calls } = availabilityFixture();

  const invalidRanges = [
    {
      startDate: '2026-12-10',
      endDate: '2026-12-01',
    },
    {
      startDate: '2026-12-01',
      endDate: '2026-12-01',
    },
    {
      startDate: '2026-02-30',
      endDate: '2026-03-05',
    },
  ];

  for (const range of invalidRanges) {
    await assert.rejects(service.addAvailability(moderator, hotelId, roomId, range));
  }

  // Invalid dates must not modify MongoDB.
  assert.equal(calls.length, 0);
});

test('HTL-04: Availability DTO rejects invalid input', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: CreateRoomAvailabilityDto,
  };

  const invalidInputs = [
    {
      startDate: '01-12-2026',
      endDate: '2026-12-10',
    },
    {
      startDate: '2026-12-01',
      endDate: 'December 10',
    },
    {
      startDate: '2026-12-01',
    },
    {
      ...firstRange,
      unexpectedField: true,
    },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(pipe.transform(input, metadata));
  }

  const valid = await pipe.transform(firstRange, metadata);

  assert.equal(valid.startDate, '2026-12-01');
  assert.equal(valid.endDate, '2026-12-10');
});
