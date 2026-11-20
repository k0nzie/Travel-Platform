import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '../../common/constants/enums';
import { coversHotelStay } from '../hotels/hotel-search.logic';
import { RoomStatus } from '../hotels/schemas/room.schema';

export type CalendarRoom = {
  status: RoomStatus;
  availabilityRanges: { startDate: string; endDate: string }[];
  blockedRanges: { startDate: string; endDate: string; reason?: string }[];
  reservationLocks: {
    bookingId: any;
    startDate: string;
    endDate: string;
    status: BookingStatus.PendingPayment | BookingStatus.Confirmed;
    expiresAt: Date;
  }[];
};

export function calendarDays(startDate: string, endDate: string, maxDays = 90): string[] {
  const format = /^\d{4}-\d{2}-\d{2}$/;
  if (!format.test(startDate) || !format.test(endDate)) throw new BadRequestException('Use YYYY-MM-DD dates');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate || end <= start) {
    throw new BadRequestException('Invalid room status date range');
  }
  const count = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (count > maxDays) throw new BadRequestException(`Choose at most ${maxDays} days`);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

/** HTL-08: Every calendar day is exactly one of Available, Booked or Blocked. */
export function roomStatusOnDate(room: CalendarRoom, date: string, references: Map<string, string>, now = new Date()) {
  const next = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  const locked = (room.reservationLocks ?? []).find((lock) =>
    lock.startDate < next && lock.endDate > date &&
    (lock.status === BookingStatus.Confirmed ||
      (lock.status === BookingStatus.PendingPayment && new Date(lock.expiresAt) > now)),
  );
  if (locked) {
    return { date, status: 'Booked', bookingReference: references.get(String(locked.bookingId)) ?? null };
  }
  const blocked = (room.blockedRanges ?? []).find((b) => b.startDate < next && b.endDate > date);
 if (room.status !== RoomStatus.Active || blocked || !coversHotelStay(room.availabilityRanges ?? [], date, next)) {
    return { date, status: 'Blocked', reason: blocked?.reason ?? (room.status !== RoomStatus.Active ? 'inactive' : 'not_available') };
  }
  return { date, status: 'Available' };
}
