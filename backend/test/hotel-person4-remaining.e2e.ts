import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, createConnection, Schema, Types } from 'mongoose';

import { BookingStatus, ProviderType, Role } from '../src/common/constants/enums';
import { HotelSearchService } from '../src/modules/hotels/hotel-search.service';
import { Hotel, HotelSchema } from '../src/modules/hotels/schemas/hotel.schema';
import { Room, RoomSchema } from '../src/modules/hotels/schemas/room.schema';
import { HotelBooking, HotelBookingSchema } from '../src/modules/hotel-bookings/schemas/hotel-booking.schema';
import { HotelReview, HotelReviewSchema } from '../src/modules/hotel-bookings/schemas/hotel-review.schema';
import { HotelReviewsService } from '../src/modules/hotel-bookings/hotel-reviews.service';
import { HotelRoomManagementService } from '../src/modules/hotel-bookings/hotel-room-management.service';
import { HotelStaffBookingsService } from '../src/modules/hotel-bookings/hotel-staff-bookings.service';

/** All writes are confined to a local MongoMemoryReplSet, never Atlas or Stripe. */
test('HTL-06/08/22/23/24: moderator scoping, deletion, calendar, stay completion and public ratings', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let connection: Connection | undefined;
  try {
    connection = await createConnection(mongo.getUri(), { dbName: 'person4_remaining_isolated' }).asPromise();
    const Hotels = connection.model(Hotel.name, HotelSchema);
    const Rooms = connection.model(Room.name, RoomSchema);
    const Bookings = connection.model(HotelBooking.name, HotelBookingSchema);
    const Reviews = connection.model(HotelReview.name, HotelReviewSchema);
    // Only the public identity fields are needed for populate; no real account or password.
    const Users = connection.model('User', new Schema({ name: String, email: String, status: String }, { collection: 'users' }));
    await Promise.all([Hotels.init(), Rooms.init(), Bookings.init(), Reviews.init(), Users.init()]);

    const hotelId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const strangerId = new Types.ObjectId();
    const bookedRoomId = new Types.ObjectId();
    const cleanRoomId = new Types.ObjectId();
    const historicalRoomId = new Types.ObjectId();
    const pastBookingId = new Types.ObjectId();
    const futureBookingId = new Types.ObjectId();
    const user: any = { id: String(userId), role: Role.User };
    const stranger: any = { id: String(strangerId), role: Role.User };
    const moderator: any = {
      id: String(new Types.ObjectId()), role: Role.HotelModerator,
      moderatorAssignment: { providerType: ProviderType.Hotel, providerId: String(hotelId) },
    };
    const otherModerator: any = {
      ...moderator,
      moderatorAssignment: { providerType: ProviderType.Hotel, providerId: String(new Types.ObjectId()) },
    };
    const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const availableStart = isoDay(55);
    const day1 = isoDay(60);
    const day2 = isoDay(61);
    const day3 = isoDay(62);
    const day4 = isoDay(63);
    const availableEnd = isoDay(90);

    await Users.insertMany([
      { _id: userId, name: 'Hotel Guest', email: 'guest@example.test', status: 'active' },
      { _id: strangerId, name: 'Another Guest', email: 'other@example.test', status: 'active' },
    ]);
    await Hotels.create({
      _id: hotelId, name: 'Isolated Hotel', address: 'Test Street', cityId: new Types.ObjectId(),
      cityName: 'Cairo', countryCode: 'EG', starClass: 4, amenities: [],
      checkInTime: '14:00', checkOutTime: '12:00',
      cancellationTiers: [{ minDays: 7, refundPercent: 50 }],
    });
    const room = (id: Types.ObjectId, label: string, locks: any[] = [], blocks: any[] = []) => ({
      _id: id, hotelId, roomLabel: label, roomKey: label.toLowerCase(), roomType: 'Standard',
      beds: 2, maxOccupancy: 3, pricePerNightMinor: 10000,
      availabilityRanges: [{ startDate: availableStart, endDate: availableEnd }],
      blockedRanges: blocks, reservationLocks: locks,
    });
    await Rooms.insertMany([
      room(bookedRoomId, '101', [{
        bookingId: futureBookingId, startDate: day1, endDate: day2,
        status: BookingStatus.Confirmed, expiresAt: new Date('2020-01-01'),
      }], [{ startDate: day2, endDate: day3, reason: 'Maintenance' }]),
      room(cleanRoomId, '102'),
      room(historicalRoomId, '103'),
    ]);
    const bookedRoom = (roomId: Types.ObjectId) => ({
      roomId, roomLabel: 'Test', roomType: 'Standard', adults: 1, childrenAges: [],
      maxOccupancy: 3, pricePerNightMinor: 10000, totalMinor: 20000,
    });
    const booking = (id: Types.ObjectId, roomId: Types.ObjectId, reference: string,
      checkIn: string, checkOut: string) => ({
      _id: id, reference, userId, hotelId, hotelName: 'Isolated Hotel', status: BookingStatus.Confirmed,
      checkIn, checkOut, nights: 2, rooms: [bookedRoom(roomId)], guestCount: 1,
      totalMinor: 20000, currency: 'USD', checkInTime: '14:00', checkOutTime: '12:00',
      cancellationTiers: [{ minDays: 7, refundPercent: 50 }], holdExpiresAt: new Date('2020-01-01'),
    });
    await Bookings.insertMany([
      booking(pastBookingId, historicalRoomId, 'HTL-OLD0001', '2020-01-01', '2020-01-03'),
      booking(futureBookingId, bookedRoomId, 'HTL-NEW0001', day1, day3),
    ]);

    const reviews = new HotelReviewsService(Reviews as any, Bookings as any, Hotels as any, connection);
    const management = new HotelRoomManagementService(Rooms as any, Bookings as any, connection);
    const staff = new HotelStaffBookingsService(Bookings as any);
    const search = new HotelSearchService(Hotels as any, Rooms as any);

    // HTL-22: Moderator sees all bookings for their own hotel, with safe guest details.
    const staffList = await staff.listForHotel(moderator, String(hotelId), { page: 1, limit: 10 });
    assert.equal(staffList.total, 2);
    assert.equal(staffList.items.length, 2);
    assert.equal(staffList.items[0].guest.name, 'Hotel Guest');
    assert.equal(staffList.items[0].guest.email, 'guest@example.test');
    assert.equal(staffList.items[0].rooms.length, 1);
    const confirmedOnly = await staff.listForHotel(moderator, String(hotelId), {
      status: BookingStatus.Confirmed, page: 1, limit: 1,
    });
    assert.equal(confirmedOnly.total, 2);
    assert.equal(confirmedOnly.items.length, 1);
    await assert.rejects(staff.listForHotel(otherModerator, String(hotelId), {}),
      (error: any) => error.getStatus() === 403);
    await assert.rejects(staff.listForHotel(user, String(hotelId), {}),
      (error: any) => error.getStatus() === 403);

    // HTL-23: An owner can review their completed stay once, never per room.
    await assert.rejects(reviews.create(stranger, { bookingId: String(pastBookingId), rating: 5 }),
      (error: any) => error.getStatus() === 404);
    await assert.rejects(reviews.create(user, { bookingId: String(futureBookingId), rating: 5 }),
      (error: any) => error.getStatus() === 409);
    const review = await reviews.create(user, { bookingId: String(pastBookingId), rating: 5, review: 'Excellent' });
    assert.equal(review.rating, 5);
    assert.equal((await Bookings.findById(pastBookingId).lean().exec())?.status, BookingStatus.Completed);
    assert.equal((await Hotels.findById(hotelId).lean().exec())?.averageRating, 5);
    assert.equal((await Hotels.findById(hotelId).lean().exec())?.ratingsCount, 1);
    await assert.rejects(reviews.create(user, { bookingId: String(pastBookingId), rating: 1 }),
      (error: any) => error.getStatus() === 409);
    await assert.rejects(reviews.update(stranger, review.id, { rating: 1 }),
      (error: any) => error.getStatus() === 404);

    // HTL-24, HTL-02 and HTL-12: Public rating, reviews, author and hotel search are linked.
    const publicView = await reviews.listPublic(String(hotelId), { page: 1, limit: 10 });
    assert.equal(publicView.total, 1);
    assert.equal(publicView.items[0].rating, 5);
    assert.equal(publicView.items[0].author.name, 'Hotel Guest');
    assert.equal(publicView.ratingsCount, 1);
    const ratingQuery: any = {
      city: 'Cairo', checkIn: day3, checkOut: day4,
      guests: 1, rooms: 1, minRating: 5, page: 1, limit: 10,
    };
    assert.equal((await search.searchHotels(ratingQuery)).total, 1);
    const updated = await reviews.update(user, review.id, { rating: 3, review: 'Good' });
    assert.equal(updated.averageRating, 3);
    assert.equal((await Hotels.findById(hotelId).lean().exec())?.averageRating, 3);
    const deleted = await reviews.delete(user, review.id);
    assert.equal(deleted.ratingsCount, 0);
    assert.equal((await Hotels.findById(hotelId).lean().exec())?.averageRating, 0);
    assert.equal((await search.searchHotels(ratingQuery)).total, 0);

    // HTL-23: Cron catches up on confirmed bookings whose checkout day has passed.
    await Bookings.updateOne({ _id: pastBookingId }, { $set: { status: BookingStatus.Confirmed } });
    assert.equal(await reviews.completeFinishedStays(), 1);
    assert.equal((await Bookings.findById(pastBookingId).lean().exec())?.status, BookingStatus.Completed);

    // HTL-08: Each room reports Booked (reference), Blocked or Available for selected nights.
    const calendar = await management.statusCalendar(moderator, String(hotelId), {
      startDate: day1, endDate: day4, page: 1, limit: 10,
    });
    assert.equal(calendar.total, 3);
    const room101 = calendar.items.find((item) => item.roomId === String(bookedRoomId));
    assert.deepEqual(room101?.days.map((day) => day.status), ['Booked', 'Blocked', 'Available']);
    assert.equal((room101?.days[0] as any).bookingReference, 'HTL-NEW0001');
    await assert.rejects(management.statusCalendar(otherModerator, String(hotelId), {
      startDate: day1, endDate: day4,
    }), (error: any) => error.getStatus() === 403);

    // HTL-06: Historical booking or a live reservation forbids deleting its room.
    await assert.rejects(management.deleteNeverReserved(moderator, String(hotelId), String(historicalRoomId)),
      (error: any) => error.getStatus() === 409);
    await assert.rejects(management.deleteNeverReserved(moderator, String(hotelId), String(bookedRoomId)),
      (error: any) => error.getStatus() === 409);
    await assert.rejects(management.deleteNeverReserved(stranger, String(hotelId), String(cleanRoomId)),
      (error: any) => error.getStatus() === 403);
    const removed = await management.deleteNeverReserved(moderator, String(hotelId), String(cleanRoomId));
    assert.equal(removed.deleted, true);
    assert.equal(await Rooms.countDocuments({ _id: cleanRoomId }), 0);
  } finally {
    if (connection) await connection.close();
    await mongo.stop();
  }
});
