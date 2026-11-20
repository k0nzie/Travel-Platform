import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertMinor, crossRate } from '../exchange-rates/fx-math';
import { deriveDays, groupByCity, insertIndex, minutesOf, reorderDays } from './itinerary-days.logic';

const day = (id: string, city: string) => ({
  _id: id,
  cityId: city,
  cityCode: city,
  cityName: city.toUpperCase(),
  countryCode: 'EG',
});
const start = new Date('2027-03-01T00:00:00Z');

test('ITN-08: day numbers and dates are derived from the start date and the order', () => {
  const days = deriveDays(start, [day('a', 'cairo'), day('b', 'cairo'), day('c', 'luxor')]);
  assert.deepEqual(
    days.map((d) => [d.id, d.dayNumber, d.date]),
    [
      ['a', 1, '2027-03-01'],
      ['b', 2, '2027-03-02'],
      ['c', 3, '2027-03-03'],
    ],
  );
});

test('ITN-07: deleting a day renumbers and re-dates the following days', () => {
  const days = deriveDays(start, [day('a', 'cairo'), day('c', 'luxor')]);
  assert.deepEqual(
    days.map((d) => [d.id, d.dayNumber, d.date]),
    [
      ['a', 1, '2027-03-01'],
      ['c', 2, '2027-03-02'],
    ],
  );
});

test('ITN-09: consecutive days in the same city are grouped; returning to a city starts a new group', () => {
  const groups = groupByCity(
    deriveDays(start, [day('a', 'cairo'), day('b', 'cairo'), day('c', 'luxor'), day('d', 'cairo')]),
  );
  assert.deepEqual(
    groups.map((g) => [g.cityCode, g.startDate, g.endDate, g.dayCount]),
    [
      ['cairo', '2027-03-01', '2027-03-02', 2],
      ['luxor', '2027-03-03', '2027-03-03', 1],
      ['cairo', '2027-03-04', '2027-03-04', 1],
    ],
  );
});

test('ITN-08: reorder accepts only a permutation of the existing days', () => {
  const days = [day('a', 'x'), day('b', 'y'), day('c', 'z')];
  assert.deepEqual(
    reorderDays(days, ['c', 'a', 'b']).map((d) => d._id),
    ['c', 'a', 'b'],
  );
  assert.throws(() => reorderDays(days, ['a', 'b']));
  assert.throws(() => reorderDays(days, ['a', 'a', 'b']));
  assert.throws(() => reorderDays(days, ['a', 'b', 'q']));
});

test('ITN-05: insert position is 1-based and appends by default', () => {
  assert.equal(insertIndex(undefined, 3), 3);
  assert.equal(insertIndex(1, 3), 0);
  assert.equal(insertIndex(4, 3), 3);
  assert.throws(() => insertIndex(5, 3));
  assert.throws(() => insertIndex(0, 3));
});

test('activity times compare as minutes', () => {
  assert.ok(minutesOf('09:30') < minutesOf('10:00'));
  assert.equal(minutesOf('23:59'), 1439);
});

test('ITN-18: cross rates through the cache base and rounding to minor units', () => {
  const rates = { EUR: 0.9, EGP: 50 };
  assert.equal(crossRate(rates, 'USD', 'USD', 'EUR'), 0.9);
  assert.equal(crossRate(rates, 'USD', 'EUR', 'USD'), 1 / 0.9);
  assert.equal(crossRate(rates, 'USD', 'EUR', 'EGP'), 50 / 0.9);
  assert.equal(crossRate(rates, 'USD', 'EGP', 'EGP'), 1);
  assert.equal(crossRate(rates, 'USD', 'GBP', 'EUR'), null);
  assert.equal(convertMinor(10000, 0.9), 9000);
  assert.equal(convertMinor(333, 1 / 3), 111);
});
