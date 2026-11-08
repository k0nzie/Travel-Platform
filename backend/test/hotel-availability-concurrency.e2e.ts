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

test('HTL-05: availability edits prevent lost updates in real MongoDB', async () => {
  const mongo = await MongoMemoryServer.create();
  let connection: Connection | undefined;

  try {
    connection = await createConnection(mongo.getUri(), {
      dbName: 'htl05_concurrency_test',
    }).asPromise();

    const RoomModel = connection.model(Room.name, RoomSchema);
    const hotelId = new Types.ObjectId();

    const initialRanges = [
      { startDate: '2027-01-01', endDate: '2027-01-10' },
      { startDate: '2027-01-10', endDate: '2027-01-20' },
    ];

    const room = await RoomModel.create({
      hotelId,
      roomLabel: 'TEST-201',
      roomKey: 'test-201',
      roomType: 'Standard',
      beds: 2,
      maxOccupancy: 3,
      pricePerNightMinor: 20000,
      availabilityRanges: initialRanges,
    });

    const moderator: any = {
      id: String(new Types.ObjectId()),
      role: Role.HotelModerator,
      moderatorAssignment: {
        providerType: ProviderType.Hotel,
        providerId: String(hotelId),
      },
    };

    const plainService = new RoomsService(RoomModel as any, {} as any);

    const firstEdit = {
      originalStartDate: '2027-01-10',
      originalEndDate: '2027-01-20',
      startDate: '2027-01-10',
      endDate: '2027-01-25',
    };

    // First verify an ordinary edit against real MongoDB.
    const edited = await plainService.updateAvailability(moderator, String(hotelId), String(room._id), firstEdit);

    assert.equal(edited.availabilityRanges[1].endDate, '2027-01-25');

    // Restore the initial schedule in this isolated database.
    await RoomModel.updateOne({ _id: room._id }, { $set: { availabilityRanges: initialRanges } }).exec();

    // Force both competing edits to read the same snapshot.
    // This creates a deterministic lost-update scenario.
    let reads = 0;
    let releaseReads: () => void = () => {};

    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });

    const guardedModel: any = {
      findOne: (filter: any) => ({
        exec: async () => {
          const snapshot = await RoomModel.findOne(filter).exec();

          reads += 1;

          if (reads === 2) {
            releaseReads();
          }

          await bothRead;

          return snapshot;
        },
      }),

      // This is the REAL Mongoose database update.
      findOneAndUpdate: (filter: any, update: any, options: any) => RoomModel.findOneAndUpdate(filter, update, options),
    };

    const service = new RoomsService(guardedModel, {} as any);

    const secondEdit = {
      ...firstEdit,
      endDate: '2027-01-28',
    };

    const results = await Promise.allSettled([
      service.updateAvailability(moderator, String(hotelId), String(room._id), firstEdit),
      service.updateAvailability(moderator, String(hotelId), String(room._id), secondEdit),
    ]);

    const successful = results.filter((result) => result.status === 'fulfilled');

    const rejected = results.filter((result) => result.status === 'rejected');

    // One edit succeeds; the competing edit must fail.
    assert.equal(successful.length, 1);
    assert.equal(rejected.length, 1);

    const failure = rejected[0] as PromiseRejectedResult;

    assert.equal(failure.reason.getStatus(), 409);

    // Verify the database contains one replacement,
    // not a lost update or overlapping schedule.
    const saved = await RoomModel.findById(room._id).lean().exec();

    assert.ok(saved);
    assert.equal(saved.availabilityRanges.length, 2);

    assert.deepEqual(
      saved.availabilityRanges
        .map((range) => ({
          startDate: range.startDate,
          endDate: range.endDate,
        }))
        .slice(0, 1),
      [initialRanges[0]],
    );

    const finalEnd = saved.availabilityRanges[1].endDate;

    assert.ok(finalEnd === '2027-01-25' || finalEnd === '2027-01-28');
  } finally {
    if (connection) {
      await connection.close();
    }

    await mongo.stop();
  }
});
