import 'reflect-metadata';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildValidationPipe } from '../../common/pipes/validation';
import { CreateRoomDto } from './dto/rooms.dto';
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
