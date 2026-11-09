import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { IS_PUBLIC_KEY } from '../../common/decorators';
import { buildValidationPipe } from '../../common/pipes/validation';
import { AvailableHotelRoomsQueryDto, HotelSearchQueryDto } from './dto/hotel-search.dto';
import { HotelsController } from './hotels.controller';
import {
  cheapestFeasibleRoomPrice,
  coversHotelStay,
  hasHotelBlock,
  isScheduleAvailable,
  validateHotelStay,
} from './hotel-search.logic';

const range = (startDate: string, endDate: string) => ({ startDate, endDate });
const month = [range('2099-03-01', '2099-03-10'), range('2099-03-10', '2099-03-20')];

// Dates are deliberately far in the future, so tests are stable over time.
test('HTL-11: stay nights use an exclusive checkout', () => {
  assert.equal(validateHotelStay('2099-03-08', '2099-03-11'), 3);
  assert.equal(validateHotelStay('2099-03-01', '2099-03-02'), 1);
});

test('HTL-11: invalid/past dates and reversed stays fail', () => {
  for (const [a, b] of [
    ['2020-01-01', '2020-01-02'],
    ['2099-02-30', '2099-03-01'],
    ['2099-03-05', '2099-03-05'],
    ['2099-03-05', '2099-03-04'],
    ['2099-03-05T00:00', '2099-03-06'],
  ])
    assert.throws(() => validateHotelStay(a, b));
});

test('HTL-11: adjacent availability periods cover a complete stay', () => {
  assert.equal(coversHotelStay(month, '2099-03-08', '2099-03-12'), true);
  assert.equal(coversHotelStay([...month].reverse(), '2099-03-08', '2099-03-12'), true);
});

test('HTL-11: a gap or short coverage excludes a room', () => {
  assert.equal(
    coversHotelStay([range('2099-03-01', '2099-03-09'), range('2099-03-10', '2099-03-20')], '2099-03-08', '2099-03-12'),
    false,
  );
  assert.equal(coversHotelStay([range('2099-03-01', '2099-03-10')], '2099-03-08', '2099-03-12'), false);
});

test('HTL-11/15: blocks override published availability', () => {
  assert.equal(
    isScheduleAvailable(
      {
        availabilityRanges: month,
        blockedRanges: [range('2099-03-09', '2099-03-11')],
        maxOccupancy: 2,
        pricePerNightMinor: 1000,
      },
      '2099-03-08',
      '2099-03-12',
    ),
    false,
  );
});

test('HTL-11: end-exclusive blocks permit a stay beginning at block checkout', () => {
  assert.equal(hasHotelBlock([range('2099-03-08', '2099-03-10')], '2099-03-10', '2099-03-12'), false);
  assert.equal(hasHotelBlock([range('2099-03-08', '2099-03-10')], '2099-03-09', '2099-03-12'), true);
});

test('HTL-11: exactly the requested rooms must fit the guest count', () => {
  const rooms = [
    { maxOccupancy: 1, pricePerNightMinor: 1000 },
    { maxOccupancy: 2, pricePerNightMinor: 2000 },
    { maxOccupancy: 3, pricePerNightMinor: 3000 },
  ];
  assert.equal(cheapestFeasibleRoomPrice(rooms, 2, 5), 2000);
  assert.equal(cheapestFeasibleRoomPrice(rooms, 2, 6), null);
  assert.equal(cheapestFeasibleRoomPrice(rooms, 4, 1), null);
});

test('HTL-12: cheapest price excludes rooms that cannot join any feasible group', () => {
  const rooms = [
    { maxOccupancy: 1, pricePerNightMinor: 500 },
    { maxOccupancy: 3, pricePerNightMinor: 2500 },
    { maxOccupancy: 4, pricePerNightMinor: 4000 },
  ];
  assert.equal(cheapestFeasibleRoomPrice(rooms, 2, 7), 2500);
  assert.equal(cheapestFeasibleRoomPrice(rooms, 1, 4), 4000);
});

test('HTL-11: capacities and room count must be positive integers', () => {
  assert.equal(cheapestFeasibleRoomPrice([{ maxOccupancy: 2, pricePerNightMinor: 1000 }], 0, 1), null);
  assert.equal(cheapestFeasibleRoomPrice([{ maxOccupancy: 2, pricePerNightMinor: 1000 }], 1, 1.5), null);
});

test('HTL-11/12: search DTO transforms query numbers, country and paging', async () => {
  const pipe = buildValidationPipe();
  const result = await pipe.transform(
    {
      checkIn: '2099-03-08',
      checkOut: '2099-03-12',
      guests: '4',
      rooms: '2',
      country: ' eg ',
      city: ' Cairo ',
      minPricePerNightMinor: '2000',
      minRating: '4.5',
      page: '2',
      limit: '10',
      sort: 'rating_desc',
    },
    { type: 'query', metatype: HotelSearchQueryDto },
  );
  assert.equal(result.country, 'EG');
  assert.equal(result.city, 'Cairo');
  assert.equal(result.guests, 4);
  assert.equal(result.rooms, 2);
  assert.equal(result.minRating, 4.5);
  assert.equal(result.page, 2);
});

test('HTL-11/12: DTO rejects malformed search parameters', async () => {
  const pipe = buildValidationPipe();
  const meta: any = { type: 'query', metatype: HotelSearchQueryDto };
  const valid = { checkIn: '2099-03-08', checkOut: '2099-03-12', guests: '2' };
  for (const bad of [
    { guests: '0' },
    { guests: '1.3' },
    { rooms: '0' },
    { minRating: '0' },
    { minRating: '6' },
    { minPricePerNightMinor: '-1' },
    { maxPricePerNightMinor: '2.5' },
    { sort: 'unknown' },
    { country: 'EGY' },
    { extra: 'unexpected' },
    { checkIn: 'bad' },
  ])
    await assert.rejects(pipe.transform({ ...valid, ...bad }, meta));
});

test('HTL-15: available room DTO requires both dates', async () => {
  const pipe = buildValidationPipe();
  const meta: any = { type: 'query', metatype: AvailableHotelRoomsQueryDto };
  await assert.rejects(pipe.transform({ checkIn: '2099-03-08' }, meta));
  const ok = await pipe.transform({ checkIn: '2099-03-08', checkOut: '2099-03-12' }, meta);
  assert.equal(ok.checkOut, '2099-03-12');
});

test('HTL-11/15: search routes are GET and public', () => {
  for (const [handler, path] of [
    [HotelsController.prototype.searchHotels, 'search'],
    [HotelsController.prototype.listAvailableRooms, ':id/rooms/available'],
  ] as const) {
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
    assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
  }
});
