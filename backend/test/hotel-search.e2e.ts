import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection, Types } from 'mongoose';

import { HotelSearchService } from '../src/modules/hotels/hotel-search.service';
import { Hotel, HotelSchema } from '../src/modules/hotels/schemas/hotel.schema';
import { Room, RoomSchema } from '../src/modules/hotels/schemas/room.schema';

const id = () => new Types.ObjectId();
const available = [
  { startDate: '2099-03-01', endDate: '2099-03-10' },
  { startDate: '2099-03-10', endDate: '2099-03-20' },
];

test('HTL-11/12/15: MongoDB search applies hotel status, blocks, dates, occupancy, price and rating', async () => {
  const mongo = await MongoMemoryServer.create();
  let connection: Connection | undefined;
  try {
    connection = await createConnection(mongo.getUri(), { dbName: 'htl_search_test' }).asPromise();
    const hotels = connection.model(Hotel.name, HotelSchema);
    const rooms = connection.model(Room.name, RoomSchema);
    const hotel = await hotels.create({
      name: 'Test Cairo',
      address: 'Test Street',
      cityId: id(),
      cityName: 'Cairo',
      countryCode: 'EG',
      starClass: 4,
      amenities: [],
      status: 'active',
      averageRating: 4.5,
      ratingsCount: 2,
    });
    const inactiveHotel = await hotels.create({
      name: 'Inactive Cairo',
      address: 'Other Street',
      cityId: id(),
      cityName: 'Cairo',
      countryCode: 'EG',
      starClass: 4,
      amenities: [],
      status: 'inactive',
      averageRating: 5,
      ratingsCount: 2,
    });
    const makeRoom = (
      roomLabel: string,
      maxOccupancy: number,
      pricePerNightMinor: number,
      extra: Record<string, unknown> = {},
    ) => ({
      hotelId: hotel._id,
      roomLabel,
      roomKey: roomLabel.toLowerCase(),
      roomType: 'Standard',
      beds: 1,
      maxOccupancy,
      pricePerNightMinor,
      availabilityRanges: available,
      ...extra,
    });
    await rooms.create([
      makeRoom('Low', 1, 500),
      makeRoom('Medium', 3, 2500),
      makeRoom('Large', 4, 4000),
      makeRoom('Blocked', 8, 100, { blockedRanges: [{ startDate: '2099-03-09', endDate: '2099-03-12' }] }),
      makeRoom('Inactive', 8, 100, { status: 'inactive' }),
      makeRoom('Gap', 8, 150, {
        availabilityRanges: [
          { startDate: '2099-03-01', endDate: '2099-03-09' },
          { startDate: '2099-03-10', endDate: '2099-03-20' },
        ],
      }),
      makeRoom('InactiveHotelRoom', 8, 100, { hotelId: inactiveHotel._id }),
    ]);

    const service = new HotelSearchService(hotels as any, rooms as any);
    const base = { checkIn: '2099-03-08', checkOut: '2099-03-12', guests: 7, rooms: 2 };
    const search = await service.searchHotels({ ...base, city: 'cairo', country: 'EG' });
    assert.equal(search.total, 1);
    assert.equal(search.items[0].id, String(hotel._id));
    assert.equal(search.items[0].availableRoomCount, 3);
    assert.equal(search.items[0].cheapestQualifyingRoomPricePerNightMinor, 2500);
    assert.equal(search.bookingConflictsChecked, false);

    const noRoom = await service.searchHotels({ ...base, guests: 8 });
    assert.equal(noRoom.total, 0);
    const filteredPrice = await service.searchHotels({ ...base, minPricePerNightMinor: 2501 });
    assert.equal(filteredPrice.total, 0);
    const inclusivePrice = await service.searchHotels({
      ...base,
      minPricePerNightMinor: 2500,
      maxPricePerNightMinor: 2500,
      minRating: 4.5,
    });
    assert.equal(inclusivePrice.total, 1);
    const filteredRating = await service.searchHotels({ ...base, minRating: 4.6 });
    assert.equal(filteredRating.total, 0);
    await assert.rejects(
      service.searchHotels({ ...base, minPricePerNightMinor: 3000, maxPricePerNightMinor: 2000 }),
      /cannot exceed/,
    );

    const roomList = await service.availableRooms(String(hotel._id), {
      checkIn: base.checkIn,
      checkOut: base.checkOut,
    });
    assert.equal(roomList.total, 3);
    assert.deepEqual(
      roomList.items.map((r) => r.roomLabel),
      ['Low', 'Medium', 'Large'],
    );
    assert.equal(roomList.items[1].totalStayPriceMinor, 4 * 2500);
    assert.equal(roomList.bookingConflictsChecked, false);
    const page2 = await service.availableRooms(String(hotel._id), {
      checkIn: base.checkIn,
      checkOut: base.checkOut,
      page: 2,
      limit: 2,
    });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.totalPages, 2);
    await assert.rejects(
      service.availableRooms(String(inactiveHotel._id), { checkIn: base.checkIn, checkOut: base.checkOut }),
      /unavailable/,
    );

    // A second active hotel proves sorting, rating filters and stable pagination.
    const budget = await hotels.create({
      name: 'Budget Cairo',
      address: 'Budget Street',
      cityId: id(),
      cityName: 'Cairo',
      countryCode: 'EG',
      starClass: 3,
      amenities: [],
      status: 'active',
      averageRating: 3,
      ratingsCount: 1,
    });
    await rooms.create([
      makeRoom('Budget1', 4, 1500, { hotelId: budget._id }),
      makeRoom('Budget2', 4, 1800, { hotelId: budget._id }),
    ]);
    const priceSorted = await service.searchHotels({ ...base, city: 'Cairo', country: 'EG', sort: 'price_asc' as any });
    assert.equal(priceSorted.total, 2);
    assert.deepEqual(
      priceSorted.items.map((h) => h.name),
      ['Budget Cairo', 'Test Cairo'],
    );
    const ratingSorted = await service.searchHotels({
      ...base,
      city: 'Cairo',
      country: 'EG',
      sort: 'rating_desc' as any,
    });
    assert.deepEqual(
      ratingSorted.items.map((h) => h.name),
      ['Test Cairo', 'Budget Cairo'],
    );
    const firstPage = await service.searchHotels({ ...base, city: 'Cairo', country: 'EG', page: 1, limit: 1 });
    const secondPage = await service.searchHotels({ ...base, city: 'Cairo', country: 'EG', page: 2, limit: 1 });
    assert.equal(firstPage.totalPages, 2);
    assert.equal(firstPage.items.length, 1);
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
    const filteredByRating = await service.searchHotels({ ...base, city: 'Cairo', country: 'EG', minRating: 4.5 });
    assert.equal(filteredByRating.total, 1);
  } finally {
    if (connection) await connection.close();
    await mongo.stop();
  }
});
