import 'reflect-metadata';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildValidationPipe } from '../../common/pipes/validation';
import {
  BlockRoomDatesDto,
  CreateRoomAvailabilityDto,
  CreateRoomDto,
  UpdateRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/rooms.dto';
import { RoomsService } from './rooms.service';
import { RoomSchema } from './schemas/room.schema';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { Role } from '../../common/constants/enums';
import { ROLES_KEY } from '../../common/decorators';
import { HotelsController } from './hotels.controller';
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

/**
 * HTL-05: Room editing tests.
 * These tests use a mocked Room model.
 */
function roomUpdateFixture(roomExists = true) {
  const calls: any[] = [];

  const savedAvailability = [
    {
      startDate: '2026-12-01',
      endDate: '2026-12-10',
    },
    {
      startDate: '2026-12-10',
      endDate: '2026-12-20',
    },
  ];

  const existingRoom = {
    _id: roomId,
    hotelId,
    roomLabel: '101',
    roomType: 'Deluxe Double',
    beds: 2,
    maxOccupancy: 3,
    pricePerNightMinor: 25000,
    status: 'active',
    availabilityRanges: savedAvailability,
  };

  const rooms: any = {
    findOneAndUpdate: (filter: any, update: any, options: any) => ({
      exec: async () => {
        calls.push({ filter, update, options });

        if (!roomExists) {
          return null;
        }

        return {
          ...existingRoom,
          ...update.$set,
        };
      },
    }),
  };

  return {
    service: new RoomsService(rooms, {} as any),
    calls,
    savedAvailability,
  };
}

test('HTL-05: Updating price preserves other room fields', async () => {
  const { service, calls, savedAvailability } = roomUpdateFixture();

  const result = await service.updateRoom(moderator, hotelId, roomId, { pricePerNightMinor: 30000 });

  assert.equal(result.pricePerNightMinor, 30000);
  assert.equal(result.beds, 2);
  assert.equal(result.maxOccupancy, 3);

  assert.deepEqual(result.availabilityRanges, savedAvailability);

  assert.deepEqual(calls[0].update, {
    $set: { pricePerNightMinor: 30000 },
  });
});

test('HTL-05: Multiple fields can be updated together', async () => {
  const { service, calls } = roomUpdateFixture();

  const result = await service.updateRoom(moderator, hotelId, roomId, {
    beds: 3,
    maxOccupancy: 4,
    pricePerNightMinor: 35000,
  });

  assert.equal(result.beds, 3);
  assert.equal(result.maxOccupancy, 4);
  assert.equal(result.pricePerNightMinor, 35000);

  assert.equal(calls.length, 1);

  assert.equal(calls[0].filter._id, roomId);
  assert.equal(String(calls[0].filter.hotelId), hotelId);

  assert.equal(calls[0].options.new, true);
  assert.equal(calls[0].options.runValidators, true);

  assert.deepEqual(calls[0].update.$set, {
    beds: 3,
    maxOccupancy: 4,
    pricePerNightMinor: 35000,
  });
});

test('HTL-05: Empty updates are rejected', async () => {
  const { service, calls } = roomUpdateFixture();

  await assert.rejects(service.updateRoom(moderator, hotelId, roomId, {}), /At least one room field must be provided/);

  assert.equal(calls.length, 0);
});

test('HTL-05: Moderator cannot edit another hotel room', async () => {
  const { service, calls } = roomUpdateFixture();

  await assert.rejects(service.updateRoom(moderator, otherHotelId, roomId, { beds: 3 }), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-05: Admin cannot use moderator-only editing', async () => {
  const { service, calls } = roomUpdateFixture();

  await assert.rejects(service.updateRoom(admin, hotelId, roomId, { beds: 3 }), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-05: Missing room returns an error', async () => {
  const { service } = roomUpdateFixture(false);

  await assert.rejects(service.updateRoom(moderator, hotelId, roomId, { beds: 3 }), /Room not found in this hotel/);
});

test('HTL-05: Invalid room updates are rejected by DTO', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: UpdateRoomDto,
  };

  const invalidUpdates = [
    { beds: 0 },
    { beds: -1 },
    { beds: 1.5 },
    { beds: null },
    { maxOccupancy: 0 },
    { maxOccupancy: 2.5 },
    { pricePerNightMinor: 0 },
    { pricePerNightMinor: -100 },
    { pricePerNightMinor: 99.5 },
    { pricePerNightMinor: Number.MAX_SAFE_INTEGER + 1 },
    { pricePerNightMinor: null },
    { roomLabel: 'HACKED' },
    { availabilityRanges: [] },
    { beds: 3, unexpectedField: true },
  ];

  for (const input of invalidUpdates) {
    await assert.rejects(pipe.transform(input, metadata), `Expected rejection for ${JSON.stringify(input)}`);
  }

  const valid: UpdateRoomDto = await pipe.transform(
    {
      beds: 3,
      pricePerNightMinor: 30000,
    },
    metadata,
  );

  assert.equal(valid.beds, 3);
  assert.equal(valid.pricePerNightMinor, 30000);
});

test('HTL-05: Room PATCH route requires hotel moderator', () => {
  const handler = HotelsController.prototype.updateRoom;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/rooms/:roomId');

  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.PATCH);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
});

/**
 * HTL-05: Availability editing test fixture.
 *
 * Simulates reading and conditionally updating a room.
 */
function availabilityEditFixture(
  options: {
    roomExists?: boolean;
    concurrentChange?: boolean;
  } = {},
) {
  const calls: any[] = [];

  const stored: {
    _id: string;
    hotelId: string;
    availabilityRanges: TestRange[];
  } = {
    _id: roomId,
    hotelId,
    availabilityRanges: [
      { startDate: '2026-12-01', endDate: '2026-12-10' },
      { startDate: '2026-12-10', endDate: '2026-12-20' },
    ],
  };

  const rooms: any = {
    findOne: (filter: any) => ({
      exec: async () => {
        calls.push({ operation: 'read', filter });

        if (options.roomExists === false) return null;

        return {
          ...stored,
          availabilityRanges: stored.availabilityRanges.map((range) => ({ ...range })),
        };
      },
    }),

    findOneAndUpdate: (filter: any, update: any, updateOptions: any) => ({
      exec: async () => {
        calls.push({
          operation: 'update',
          filter,
          update,
          options: updateOptions,
        });

        // Simulate the MongoDB conditional array match.
        const scheduleUnchanged =
          JSON.stringify(filter.availabilityRanges) === JSON.stringify(stored.availabilityRanges);

        if (options.concurrentChange || !scheduleUnchanged) {
          return null;
        }

        stored.availabilityRanges = update.$set.availabilityRanges.map((range: TestRange) => ({ ...range }));

        return {
          ...stored,
          availabilityRanges: stored.availabilityRanges.map((range) => ({ ...range })),
        };
      },
    }),
  };

  return {
    service: new RoomsService(rooms, {} as any),
    calls,
    stored,
  };
}

const validAvailabilityEdit: UpdateRoomAvailabilityDto = {
  originalStartDate: '2026-12-10',
  originalEndDate: '2026-12-20',
  startDate: '2026-12-10',
  endDate: '2026-12-24',
};

test('HTL-05: Existing availability range can be edited', async () => {
  const { service, stored } = availabilityEditFixture();

  const result = await service.updateAvailability(moderator, hotelId, roomId, validAvailabilityEdit);

  assert.equal(result.roomId, roomId);
  assert.equal(result.hotelId, hotelId);

  assert.deepEqual(result.availabilityRanges, [
    { startDate: '2026-12-01', endDate: '2026-12-10' },
    { startDate: '2026-12-10', endDate: '2026-12-24' },
  ]);

  assert.deepEqual(result.availabilityRanges, stored.availabilityRanges);
});

test('HTL-05: Availability update uses a conditional MongoDB write', async () => {
  const { service, calls } = availabilityEditFixture();

  await service.updateAvailability(moderator, hotelId, roomId, validAvailabilityEdit);

  const write = calls.find((call) => call.operation === 'update');

  assert.ok(write);
  assert.equal(write.filter._id, roomId);
  assert.equal(String(write.filter.hotelId), hotelId);

  assert.deepEqual(write.filter.availabilityRanges, [
    { startDate: '2026-12-01', endDate: '2026-12-10' },
    { startDate: '2026-12-10', endDate: '2026-12-20' },
  ]);

  assert.deepEqual(write.update.$set.availabilityRanges, [
    { startDate: '2026-12-01', endDate: '2026-12-10' },
    { startDate: '2026-12-10', endDate: '2026-12-24' },
  ]);

  assert.equal(write.options.new, true);
  assert.equal(write.options.runValidators, true);
});

test('HTL-05: Availability editing rejects overlapping ranges', async () => {
  const { service, stored, calls } = availabilityEditFixture();

  await assert.rejects(
    service.updateAvailability(moderator, hotelId, roomId, {
      ...validAvailabilityEdit,
      startDate: '2026-12-08',
      endDate: '2026-12-24',
    }),
    /overlaps an existing range/,
  );

  assert.equal(stored.availabilityRanges[1].endDate, '2026-12-20');
  assert.equal(
    calls.some((call) => call.operation === 'update'),
    false,
  );
});

test('HTL-05: Availability remains sorted after editing', async () => {
  const { service } = availabilityEditFixture();

  const result = await service.updateAvailability(moderator, hotelId, roomId, {
    ...validAvailabilityEdit,
    startDate: '2026-11-20',
    endDate: '2026-11-30',
  });

  assert.deepEqual(result.availabilityRanges, [
    { startDate: '2026-11-20', endDate: '2026-11-30' },
    { startDate: '2026-12-01', endDate: '2026-12-10' },
  ]);
});

test('HTL-05: Missing original availability range returns 404', async () => {
  const { service, calls } = availabilityEditFixture();

  await assert.rejects(
    service.updateAvailability(moderator, hotelId, roomId, {
      ...validAvailabilityEdit,
      originalStartDate: '2027-01-01',
      originalEndDate: '2027-01-10',
    }),
    /Original availability range not found/,
  );

  assert.equal(
    calls.some((call) => call.operation === 'update'),
    false,
  );
});

test('HTL-05: Concurrent schedule modification returns conflict', async () => {
  const { service } = availabilityEditFixture({
    concurrentChange: true,
  });

  await assert.rejects(
    service.updateAvailability(moderator, hotelId, roomId, validAvailabilityEdit),
    /Availability changed during editing/,
  );
});

test('HTL-05: Availability editing enforces hotel assignment', async () => {
  const { service, calls } = availabilityEditFixture();

  await assert.rejects(
    service.updateAvailability(moderator, otherHotelId, roomId, validAvailabilityEdit),
    /assigned hotel/,
  );

  assert.equal(calls.length, 0);
});

test('HTL-05: Availability editing rejects unknown rooms and invalid dates', async () => {
  const missing = availabilityEditFixture({
    roomExists: false,
  });

  await assert.rejects(
    missing.service.updateAvailability(moderator, hotelId, roomId, validAvailabilityEdit),
    /Room not found in this hotel/,
  );

  const invalid = [
    {
      ...validAvailabilityEdit,
      endDate: '2026-12-01',
    },
    {
      ...validAvailabilityEdit,
      endDate: '2026-12-10',
    },
    {
      ...validAvailabilityEdit,
      startDate: '2026-02-30',
      endDate: '2026-03-05',
    },
  ];

  const { service, calls } = availabilityEditFixture();

  for (const dto of invalid) {
    await assert.rejects(service.updateAvailability(moderator, hotelId, roomId, dto));
  }

  assert.equal(calls.length, 0);
});

test('HTL-05: Availability DTO and PATCH route are protected', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: UpdateRoomAvailabilityDto,
  };

  const invalidInputs = [
    { ...validAvailabilityEdit, endDate: '24-12-2026' },
    { ...validAvailabilityEdit, startDate: null },
    { ...validAvailabilityEdit, originalEndDate: undefined },
    { ...validAvailabilityEdit, unknownField: true },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(pipe.transform(input, metadata));
  }

  const valid = await pipe.transform(validAvailabilityEdit, metadata);

  assert.equal(valid.endDate, '2026-12-24');

  const handler = HotelsController.prototype.updateRoomAvailability;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/rooms/:roomId/availability');

  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.PATCH);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
});

/**
 * HTL-06: Room blocking test fixture.
 *
 * Simulates MongoDB's conditional update.
 * Does not access the shared Atlas database.
 */
type TestBlock = {
  startDate: string;
  endDate: string;
  reason?: string;
};

function roomBlockingFixture(
  options: {
    exists?: boolean;
    inactive?: boolean;
    initialBlocks?: TestBlock[];
  } = {},
) {
  const calls: any[] = [];

  const room = {
    _id: roomId,
    hotelId,
    status: options.inactive ? 'inactive' : 'active',
    availabilityRanges: [
      {
        startDate: '2026-12-01',
        endDate: '2026-12-24',
      },
    ],
    blockedRanges: [...(options.initialBlocks ?? [])],
  };

  const rooms: any = {
    findOneAndUpdate: (filter: any, update: any, updateOptions: any) => ({
      exec: async () => {
        calls.push({
          operation: 'write',
          filter,
          update,
          options: updateOptions,
        });

        if (options.exists === false) return null;
        if (room.status !== 'active') return null;

        const next: TestBlock = update.$push.blockedRanges;

        const overlaps = room.blockedRanges.some(
          (existing) => existing.startDate < next.endDate && existing.endDate > next.startDate,
        );

        if (overlaps) return null;

        room.blockedRanges.push({ ...next });

        return {
          ...room,
          blockedRanges: room.blockedRanges.map((block) => ({ ...block })),
        };
      },
    }),

    findOne: (filter: any) => ({
      exec: async () => {
        calls.push({
          operation: 'read',
          filter,
        });

        return options.exists === false ? null : room;
      },
    }),
  };

  return {
    service: new RoomsService(rooms, {} as any),
    calls,
    room,
  };
}

const validBlock: BlockRoomDatesDto = {
  startDate: '2026-12-12',
  endDate: '2026-12-15',
  reason: 'Air conditioning maintenance',
};

test('HTL-06: Moderator blocks dates within bookable availability', async () => {
  const { service, room } = roomBlockingFixture();

  const result = await service.blockRoomDates(moderator, hotelId, roomId, validBlock);

  assert.equal(result.roomId, roomId);
  assert.equal(result.hotelId, hotelId);
  assert.equal(result.status, 'active');

  assert.deepEqual(result.blockedRanges, [validBlock]);

  // Blocking must not delete the bookable schedule.
  assert.deepEqual(room.availabilityRanges, [
    {
      startDate: '2026-12-01',
      endDate: '2026-12-24',
    },
  ]);
});

test('HTL-06: Blocks use an atomic conditional MongoDB update', async () => {
  const { service, calls } = roomBlockingFixture();

  await service.blockRoomDates(moderator, hotelId, roomId, validBlock);

  const write = calls.find((call) => call.operation === 'write');

  assert.ok(write);
  assert.equal(write.filter._id, roomId);
  assert.equal(String(write.filter.hotelId), hotelId);
  assert.equal(write.filter.status, 'active');

  assert.deepEqual(write.filter.blockedRanges, {
    $not: {
      $elemMatch: {
        startDate: { $lt: validBlock.endDate },
        endDate: { $gt: validBlock.startDate },
      },
    },
  });

  assert.deepEqual(write.update.$push.blockedRanges, validBlock);

  assert.equal(write.options.new, true);
  assert.equal(write.options.runValidators, true);

  assert.ok(RoomSchema.path('blockedRanges'));
});

test('HTL-06: Duplicate and overlapping blocks return 409', async () => {
  const attempts = [
    {
      startDate: '2026-12-12',
      endDate: '2026-12-15',
    },
    {
      startDate: '2026-12-14',
      endDate: '2026-12-18',
    },
    {
      startDate: '2026-12-10',
      endDate: '2026-12-13',
    },
    {
      startDate: '2026-12-13',
      endDate: '2026-12-14',
    },
  ];

  for (const attempt of attempts) {
    const { service, room } = roomBlockingFixture({
      initialBlocks: [validBlock],
    });

    await assert.rejects(service.blockRoomDates(moderator, hotelId, roomId, attempt), (error: any) => {
      assert.equal(error.getStatus(), 409);
      assert.equal(error.getResponse().code, 'ROOM_BLOCK_OVERLAP');
      return true;
    });

    assert.deepEqual(room.blockedRanges, [validBlock]);
  }
});

test('HTL-06: Adjacent blocks are allowed and sorted', async () => {
  const { service } = roomBlockingFixture({
    initialBlocks: [validBlock],
  });

  const result = await service.blockRoomDates(moderator, hotelId, roomId, {
    startDate: '2026-12-15',
    endDate: '2026-12-18',
  });

  assert.equal(result.blockedRanges.length, 2);
  assert.equal(result.blockedRanges[0].startDate, '2026-12-12');
  assert.equal(result.blockedRanges[1].startDate, '2026-12-15');
});

test('HTL-06: Inactive rooms cannot receive new blocks', async () => {
  const { service, room } = roomBlockingFixture({
    inactive: true,
  });

  await assert.rejects(service.blockRoomDates(moderator, hotelId, roomId, validBlock), (error: any) => {
    assert.equal(error.getStatus(), 409);
    assert.equal(error.getResponse().code, 'ROOM_INACTIVE');
    return true;
  });

  assert.equal(room.blockedRanges.length, 0);
});

test('HTL-06: Unknown room returns 404', async () => {
  const { service } = roomBlockingFixture({
    exists: false,
  });

  await assert.rejects(service.blockRoomDates(moderator, hotelId, roomId, validBlock), /Room not found in this hotel/);
});

test('HTL-06: Only the assigned moderator may block dates', async () => {
  const { service, calls } = roomBlockingFixture();

  await assert.rejects(service.blockRoomDates(moderator, otherHotelId, roomId, validBlock), /assigned hotel/);

  await assert.rejects(service.blockRoomDates(admin, hotelId, roomId, validBlock), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-06: Invalid block dates are rejected before database access', async () => {
  const { service, calls } = roomBlockingFixture();

  const invalid = [
    {
      startDate: '2026-12-15',
      endDate: '2026-12-12',
    },
    {
      startDate: '2026-12-12',
      endDate: '2026-12-12',
    },
    {
      startDate: '2026-02-30',
      endDate: '2026-03-05',
    },
    {
      startDate: '12-12-2026',
      endDate: '2026-12-15',
    },
  ];

  for (const dto of invalid) {
    await assert.rejects(service.blockRoomDates(moderator, hotelId, roomId, dto));
  }

  assert.equal(calls.length, 0);
});

test('HTL-06: Block DTO rejects invalid input', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: BlockRoomDatesDto,
  };

  const invalid = [
    { ...validBlock, startDate: '12/12/2026' },
    { ...validBlock, endDate: null },
    { ...validBlock, reason: null },
    { ...validBlock, reason: '   ' },
    { ...validBlock, reason: 'x'.repeat(201) },
    { ...validBlock, reason: 123 },
    { ...validBlock, extraField: true },
  ];

  for (const dto of invalid) {
    await assert.rejects(pipe.transform(dto, metadata), `Expected invalid DTO: ${JSON.stringify(dto)}`);
  }

  const valid = await pipe.transform(validBlock, metadata);

  assert.equal(valid.reason, 'Air conditioning maintenance');
});

test('HTL-06: Blocking route requires hotel moderator', () => {
  const handler = HotelsController.prototype.blockRoomDates;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/rooms/:roomId/blocks');

  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
});

/**
 * HTL-06: Room deactivation test fixture.
 */

/**
 * HTL-06: Room deactivation test fixture.
 *
 * Simulates MongoDB updates without accessing Atlas.
 */
function deactivationFixture(
  options: {
    exists?: boolean;
    status?: 'active' | 'inactive';
  } = {},
) {
  const calls: any[] = [];

  const room = {
    _id: roomId,
    hotelId,
    roomLabel: '101',
    status: options.status ?? 'active',
    availabilityRanges: [
      {
        startDate: '2026-12-01',
        endDate: '2026-12-24',
      },
    ],
    blockedRanges: [
      {
        startDate: '2026-12-12',
        endDate: '2026-12-15',
        reason: 'Maintenance',
      },
    ],
  };

  const rooms: any = {
    findOneAndUpdate: (filter: any, update: any, updateOptions: any) => ({
      exec: async () => {
        calls.push({
          operation: 'update',
          filter,
          update,
          options: updateOptions,
        });

        if (options.exists === false) return null;
        if (room.status !== 'active') return null;

        room.status = update.$set.status;

        return { ...room };
      },
    }),

    findOne: (filter: any) => ({
      exec: async () => {
        calls.push({
          operation: 'read',
          filter,
        });

        return options.exists === false ? null : room;
      },
    }),
  };

  return {
    service: new RoomsService(rooms, {} as any),
    room,
    calls,
  };
}

/**
 * Test 1: Successful deactivation.
 */
test('HTL-06: Deactivation preserves room dates', async () => {
  const { service, room } = deactivationFixture();

  const result = await service.deactivateRoom(moderator, hotelId, roomId);

  assert.equal(result.id, roomId);
  assert.equal(result.hotelId, hotelId);
  assert.equal(result.status, 'inactive');
  assert.equal(room.status, 'inactive');

  assert.deepEqual(result.availabilityRanges, room.availabilityRanges);

  assert.deepEqual(result.blockedRanges, room.blockedRanges);
});

/**
 * Test 2: Atomic database operation.
 */
test('HTL-06: Deactivation uses an atomic scoped update', async () => {
  const { service, calls } = deactivationFixture();

  await service.deactivateRoom(moderator, hotelId, roomId);

  const write = calls.find((call) => call.operation === 'update');

  assert.ok(write);

  assert.equal(write.filter._id, roomId);
  assert.equal(String(write.filter.hotelId), hotelId);
  assert.equal(write.filter.status, 'active');

  assert.deepEqual(write.update, {
    $set: {
      status: 'inactive',
    },
  });

  assert.equal(write.options.new, true);
  assert.equal(write.options.runValidators, true);
});

/**
 * Test 3: Cannot deactivate twice.
 */
test('HTL-06: Already inactive room returns 409', async () => {
  const { service } = deactivationFixture({
    status: 'inactive',
  });

  await assert.rejects(service.deactivateRoom(moderator, hotelId, roomId), (error: any) => {
    assert.equal(error.getStatus(), 409);
    assert.equal(error.getResponse().code, 'ROOM_ALREADY_INACTIVE');
    return true;
  });
});

/**
 * Test 4: Unknown room.
 */
test('HTL-06: Missing room cannot be deactivated', async () => {
  const { service } = deactivationFixture({
    exists: false,
  });

  await assert.rejects(service.deactivateRoom(moderator, hotelId, roomId), (error: any) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

/**
 * Test 5: Authorization.
 */
test('HTL-06: Deactivation enforces hotel moderator assignment', async () => {
  const { service, calls } = deactivationFixture();

  await assert.rejects(service.deactivateRoom(moderator, otherHotelId, roomId), /assigned hotel/);

  await assert.rejects(service.deactivateRoom(admin, hotelId, roomId), /assigned hotel/);

  // Unauthorized users must not reach MongoDB.
  assert.equal(calls.length, 0);
});

/**
 * Test 6: Route protection.
 */
test('HTL-06: Deactivation PATCH route requires moderator', () => {
  const handler = HotelsController.prototype.deactivateRoom;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/rooms/:roomId/deactivate');

  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.PATCH);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
});
