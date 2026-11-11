import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BookingStatus } from '../../common/constants/enums';
import { RoomStatus } from '../hotels/schemas/room.schema';
import { calendarDays, roomStatusOnDate } from './hotel-room-status.logic';

const base: any = {
  status: RoomStatus.Active,
  availabilityRanges: [{ startDate: '2027-02-01', endDate: '2027-03-01' }],
  blockedRanges: [{ startDate: '2027-02-02', endDate: '2027-02-03', reason: 'Maintenance' }],
  reservationLocks: [{ bookingId: 'B1', startDate: '2027-02-01', endDate: '2027-02-02',
    status: BookingStatus.Confirmed, expiresAt: new Date('2026-12-31') }],
};

test('HTL-08: daily statuses are Available, Booked with ref, or Blocked', () => {
  const refs = new Map([['B1', 'HTL-REF1']]);
  assert.deepEqual(calendarDays('2027-02-01', '2027-02-04'), ['2027-02-01', '2027-02-02', '2027-02-03']);
  assert.deepEqual(roomStatusOnDate(base, '2027-02-01', refs).status, 'Booked');
  assert.deepEqual((roomStatusOnDate(base, '2027-02-01', refs) as any).bookingReference, 'HTL-REF1');
  assert.deepEqual(roomStatusOnDate(base, '2027-02-02', refs).status, 'Blocked');
  assert.deepEqual(roomStatusOnDate(base, '2027-02-03', refs).status, 'Available');
});

test('HTL-08: expired holds are ignored; inactive rooms cannot be shown available', () => {
  const held = { ...base, blockedRanges: [], reservationLocks: [{ ...base.reservationLocks[0],
    status: BookingStatus.PendingPayment, expiresAt: new Date('2020-01-01') }] };
  assert.equal(roomStatusOnDate(held, '2027-02-01', new Map()).status, 'Available');
  assert.equal(roomStatusOnDate({ ...held, status: RoomStatus.Inactive }, '2027-02-01', new Map()).status, 'Blocked');
});

test('HTL-08: calendar validation rejects impossible and excessive date ranges', () => {
  for (const [start, end] of [
    ['2027-02-31', '2027-03-03'], ['2027-02-02', '2027-02-02'],
    ['2027-04-05', '2027-04-04'], ['2027-01-01', '2027-10-01'],
  ]) assert.throws(() => calendarDays(start, end));
});
