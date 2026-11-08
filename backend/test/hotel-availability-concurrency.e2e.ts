import 'reflect-metadata';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection, Types } from 'mongoose';

import { ProviderType, Role } from '../src/common/constants/enums';
import { RoomsService } from '../src/modules/hotels/rooms.service';
import { Room, RoomSchema } from '../src/modules/hotels/schemas/room.schema';

test('HTL-04: concurrent overlapping ranges cannot both be saved', async () => {
  // Create a temporary MongoDB database, separate from Atlas.
  const mongo = await MongoMemoryServer.create();
  let connection: Connection | undefined;

  try {
    connection = await createConnection(mongo.getUri(), {
      dbName: 'htl04_concurrency_test',
    }).asPromise();

    const RoomModel = connection.model(Room.name, RoomSchema);

    const hotelId = new Types.ObjectId();

    const room = await RoomModel.create({
      hotelId,
      roomLabel: 'TEST-101',
      roomKey: 'test-101',
      roomType: 'Standard',
      beds: 1,
      maxOccupancy: 2,
      pricePerNightMinor: 15000,
      availabilityRanges: [],
    });

    const moderator: any = {
      id: String(new Types.ObjectId()),
      role: Role.HotelModerator,
      moderatorAssignment: {
        providerType: ProviderType.Hotel,
        providerId: String(hotelId),
      },
    };

    const service = new RoomsService(RoomModel as any, {} as any);

    const firstRange = {
      startDate: '2027-01-01',
      endDate: '2027-01-10',
    };

    const overlappingRange = {
      startDate: '2027-01-05',
      endDate: '2027-01-15',
    };

    // Start both database writes without awaiting either one.
    const results = await Promise.allSettled([
      service.addAvailability(moderator, String(hotelId), String(room._id), firstRange),
      service.addAvailability(moderator, String(hotelId), String(room._id), overlappingRange),
    ]);

    const successful = results.filter((result) => result.status === 'fulfilled');

    const rejected = results.filter((result) => result.status === 'rejected');

    // Exactly one request may succeed.
    assert.equal(successful.length, 1);
    assert.equal(rejected.length, 1);

    const failure = rejected[0] as PromiseRejectedResult;
    assert.equal(failure.reason.getStatus(), 409);

    // Check the actual MongoDB document.
    const stored = await RoomModel.findById(room._id).lean().exec();

    assert.ok(stored);
    assert.equal(stored.availabilityRanges.length, 1);

    const savedRange = stored.availabilityRanges[0];

    const matchesFirst = savedRange.startDate === firstRange.startDate && savedRange.endDate === firstRange.endDate;

    const matchesSecond =
      savedRange.startDate === overlappingRange.startDate && savedRange.endDate === overlappingRange.endDate;

    assert.ok(matchesFirst || matchesSecond);
  } finally {
    // Shut down and remove the isolated database.
    if (connection) {
      await connection.close();
    }

    await mongo.stop();
  }
});
