import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, createConnection, Types } from 'mongoose';

import { BookingStatus, ProviderType, Role } from '../src/common/constants/enums';
import { HotelInventoryService } from '../src/modules/hotels/hotel-inventory.service';
import { HotelSearchService } from '../src/modules/hotels/hotel-search.service';
import { RoomsService } from '../src/modules/hotels/rooms.service';
import { Hotel, HotelSchema } from '../src/modules/hotels/schemas/hotel.schema';
import { Room, RoomSchema } from '../src/modules/hotels/schemas/room.schema';
import { HotelBookingsService } from '../src/modules/hotel-bookings/hotel-bookings.service';
import { HotelBooking, HotelBookingSchema } from '../src/modules/hotel-bookings/schemas/hotel-booking.schema';

/** All writes use an isolated replica set, NEVER shared Atlas. Transactions require a replica set. */
test('HTL-16/17/18: real MongoDB multi-room holds are atomic, confirmed on payment, expire and exclude search', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let connection: Connection | undefined;
  try {
    connection = await createConnection(mongo.getUri(), { dbName: 'hotel_booking_isolated_test' }).asPromise();
    const Hotels = connection.model(Hotel.name, HotelSchema);
    const Rooms = connection.model(Room.name, RoomSchema);
    const Bookings = connection.model(HotelBooking.name, HotelBookingSchema);
    await Promise.all([Hotels.init(), Rooms.init(), Bookings.init()]);

    const hotelId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const user: any = { id: String(userId), role: Role.User };
    const stranger: any = { id: String(otherUserId), role: Role.User };
    const moderator: any = {
      id: String(new Types.ObjectId()),
      role: Role.HotelModerator,
      moderatorAssignment: { providerType: ProviderType.Hotel, providerId: String(hotelId) },
    };
    const id0 = new Types.ObjectId('507f1f77bcf86cd799439010');
    const id1 = new Types.ObjectId('507f1f77bcf86cd799439011');
    const id2 = new Types.ObjectId('507f1f77bcf86cd799439012');
    const id3 = new Types.ObjectId('507f1f77bcf86cd799439013');
    await Hotels.create({
      _id: hotelId,
      name: 'Isolated Booking Test Hotel',
      address: 'Test Street',
      cityId: new Types.ObjectId(),
      cityName: 'Cairo',
      countryCode: 'EG',
      starClass: 4,
      amenities: [],
      checkInTime: '14:00',
      checkOutTime: '12:00',
      cancellationTiers: [{ minDays: 7, refundPercent: 100 }],
    });
    for (const [id, label, capacity, price] of [
      [id0, '100', 2, 9000],
      [id1, '101', 3, 10000],
      [id2, '102', 2, 20000],
      [id3, '103', 2, 18000],
    ] as const) {
      await Rooms.create({
        _id: id,
        hotelId,
        roomLabel: label,
        roomKey: label,
        roomType: 'Standard',
        beds: 2,
        maxOccupancy: capacity,
        pricePerNightMinor: price,
        availabilityRanges: [{ startDate: '2027-02-01', endDate: '2027-03-01' }],
        blockedRanges: [],
      });
    }

    const notifications: any[] = [];
    const paymentCalls: any[] = [];
    const inventory = new HotelInventoryService(Hotels as any, Rooms as any);
    const service = new HotelBookingsService(
      Bookings as any,
      connection,
      inventory,
      { get: () => 'USD' } as any,
      {
        cancelOpenIntent: async (...args: any[]) => {
          paymentCalls.push(args);
        },
        summaryForBooking: async () => null,
      } as any,
      {
        notify: async (_userId: any, data: any) => {
          notifications.push(data);
        },
      } as any,
      { register: () => undefined } as any,
      { registerDeactivationCheck: () => undefined } as any,
    );
    service.onModuleInit();
    const search = new HotelSearchService(Hotels as any, Rooms as any);
    const roomsService = new RoomsService(Rooms as any, Hotels as any);
    const original = {
      hotelId: String(hotelId),
      checkIn: '2027-02-01',
      checkOut: '2027-02-03',
      rooms: [
        { roomId: String(id1), adults: 2, childrenAges: [7] },
        { roomId: String(id2), adults: 0, childrenAges: [15] },
      ],
    };

    const quote = await service.summary(user, original);
    assert.equal(quote.totalMinor, 60000);
    assert.equal(quote.guestCount, 4);
    const pending = await service.createHold(user, original);
    assert.equal(pending.status, BookingStatus.PendingPayment);
    assert.equal(pending.rooms.length, 2);
    const locks = await Rooms.find({ _id: { $in: [id1, id2] } })
      .lean()
      .exec();
    for (const r of locks) {
      assert.equal(r.reservationLocks.length, 1);
      assert.equal(r.reservationLocks[0].status, BookingStatus.PendingPayment);
      assert.equal(String(r.reservationLocks[0].bookingId), pending.id);
    }

    // Every room is checked before the hold; a conflicting request must fail.
    await assert.rejects(service.createHold(stranger, original), (error: any) => error.getStatus() === 409);
    const notBookable = await search.availableRooms(String(hotelId), {
      checkIn: '2027-02-01',
      checkOut: '2027-02-03',
      page: 1,
      limit: 10,
    });
    assert.equal(notBookable.bookingConflictsChecked, true);
    assert.equal(notBookable.total, 2); // rooms 100 and 103 remain free
    assert.ok(notBookable.items.every((r) => ![String(id1), String(id2)].includes(r.id)));

    const context = await service.getPaymentContext(pending.id, user);
    assert.equal(context.amountMinor, 60000);
    assert.equal(context.policies.checkInTime, '14:00');
    await assert.rejects(service.getPaymentContext(pending.id, stranger), (error: any) => error.getStatus() === 404);

    const paymentId = new Types.ObjectId();
    assert.equal(await service.onPaymentSucceeded(pending.id, String(paymentId)), true);
    assert.equal(await service.onPaymentSucceeded(pending.id, String(paymentId)), true); // idempotent
    assert.equal(notifications.filter((n) => n.type === 'booking_confirmed').length, 1);
    const confirmed = await Bookings.findById(pending.id).lean().exec();
    assert.equal(confirmed?.status, BookingStatus.Confirmed);
    assert.equal(String(confirmed?.paymentId), String(paymentId));

    // HTL-20: Confirmed booking appears in its owner's history.
    const upcomingHistory = await service.list(user, {
      scope: 'upcoming',
      page: 1,
      limit: 10,
    });

    assert.equal(upcomingHistory.total, 1);
    assert.equal(upcomingHistory.items.length, 1);
    assert.equal(upcomingHistory.items[0].reference, pending.reference);
    assert.equal(upcomingHistory.items[0].rooms.length, 2);

    // Another traveller must not see this reservation.
    const strangerHistory = await service.list(stranger, {
      scope: 'upcoming',
      page: 1,
      limit: 10,
    });

    assert.equal(strangerHistory.total, 0);
    assert.deepEqual(strangerHistory.items, []);

    for (const r of await Rooms.find({ _id: { $in: [id1, id2] } })
      .lean()
      .exec()) {
      assert.equal(r.reservationLocks[0].status, BookingStatus.Confirmed);
    }
    await assert.rejects(service.getPaymentContext(pending.id, user), (error: any) => error.getStatus() === 409);

    // Moderator cannot block or deactivate a reserved room.
    await assert.rejects(
      roomsService.blockRoomDates(moderator, String(hotelId), String(id1), {
        startDate: '2027-02-02',
        endDate: '2027-02-04',
        reason: 'Maintenance',
      }),
      (error: any) => error.getStatus() === 409 && error.getResponse().code === 'ROOM_RESERVED',
    );
    await assert.rejects(
      roomsService.deactivateRoom(moderator, String(hotelId), String(id1)),
      (error: any) => error.getStatus() === 409 && error.getResponse().code === 'ROOM_RESERVED',
    );
    await assert.rejects(
      roomsService.updateAvailability(moderator, String(hotelId), String(id1), {
        originalStartDate: '2027-02-01',
        originalEndDate: '2027-03-01',
        startDate: '2027-02-10',
        endDate: '2027-03-01',
      }),
      (error: any) => error.getStatus() === 409 && error.getResponse().code === 'RESERVED_DATES_IMMUTABLE',
    );

    // A check-in exactly at the previous check-out does not overlap.
    const adjacent = await service.createHold(stranger, {
      ...original,
      checkIn: '2027-02-03',
      checkOut: '2027-02-05',
    });
    assert.equal(adjacent.status, BookingStatus.PendingPayment);

    // Every write to a transaction rolls back if a later room cannot be held.
    const reserve = inventory.reserve.bind(inventory);
    let claimedCount = 0;
    (inventory as any).reserve = async (...args: any[]) => {
      claimedCount++;
      if (claimedCount === 2) return false;
      return reserve(...(args as Parameters<typeof reserve>));
    };
    try {
      await assert.rejects(
        service.createHold(user, {
          hotelId: String(hotelId),
          checkIn: '2027-02-10',
          checkOut: '2027-02-12',
          rooms: [
            { roomId: String(id0), adults: 1, childrenAges: [] },
            { roomId: String(id3), adults: 1, childrenAges: [] },
          ],
        }),
        (error: any) => error.getStatus() === 409,
      );
    } finally {
      (inventory as any).reserve = reserve;
    }
    assert.equal((await Rooms.findById(id0).lean().exec()).reservationLocks.length, 0);
    assert.equal((await Rooms.findById(id3).lean().exec()).reservationLocks.length, 0);

    // Expiry job releases both room locks and marks the reservation Expired.
    await Bookings.updateOne({ _id: adjacent.id }, { $set: { holdExpiresAt: new Date('2020-01-01') } });
    await service.expireHolds();
    assert.equal((await Bookings.findById(adjacent.id).lean().exec()).status, BookingStatus.Expired);
    for (const r of await Rooms.find({ _id: { $in: [id1, id2] } })
      .lean()
      .exec()) {
      assert.equal(r.reservationLocks.length, 1); // only the original confirmed lock remains
    }
    assert.equal(await service.onPaymentSucceeded(adjacent.id, String(new Types.ObjectId())), false);
    assert.equal(paymentCalls.length, 1);
    assert.equal(notifications.filter((n) => n.type === 'booking_expired').length, 1);

    // Two parallel attempts for the same room and dates cannot both succeed.
    const concurrent = {
      hotelId: String(hotelId),
      checkIn: '2027-02-14',
      checkOut: '2027-02-16',
      rooms: [{ roomId: String(id3), adults: 1, childrenAges: [] }],
    };
    const attempts = await Promise.allSettled([
      service.createHold(user, concurrent),
      service.createHold(stranger, concurrent),
    ]);
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((r) => r.status === 'rejected').length, 1);
    assert.equal((await Rooms.findById(id3).lean().exec()).reservationLocks.length, 1);

    // HTL-20: An expired booking appears in Past.
    const pastHistory = await service.list(stranger, {
      scope: 'past',
      page: 1,
      limit: 10,
    });

    assert.ok(pastHistory.items.some((b) => b.id === adjacent.id));

    // Create a cancelled booking fixture in isolated MongoDB.
    const cancelledBooking = await Bookings.create({
      reference: 'HTL-TEST-CANCELLED',
      userId,
      hotelId,
      hotelName: 'Isolated Booking Test Hotel',
      status: BookingStatus.Cancelled,
      checkIn: '2027-02-01',
      checkOut: '2027-02-03',
      nights: 2,
      rooms: [{
        roomId: id0,
        roomLabel: '100',
        roomType: 'Standard',
        adults: 1,
        childrenAges: [],
        maxOccupancy: 2,
        pricePerNightMinor: 9000,
        totalMinor: 18000,
      }],
      guestCount: 1,
      totalMinor: 18000,
      currency: 'USD',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      cancellationTiers: [{ minDays: 7, refundPercent: 100 }],
      holdExpiresAt: new Date('2027-01-01'),
    });

    // Cancelled bookings appear only in their owner's history.
    const cancelledHistory = await service.list(user, {
      scope: 'cancelled',
      page: 1,
      limit: 10,
    });

    assert.ok(
      cancelledHistory.items.some(
        (b) => b.id === String(cancelledBooking._id),
      ),
    );

    const strangerCancelled = await service.list(stranger, {
      scope: 'cancelled',
      page: 1,
      limit: 10,
    });

    assert.equal(strangerCancelled.total, 0);

  } finally {
    if (connection) await connection.close();
    await mongo.stop();
  }
});
