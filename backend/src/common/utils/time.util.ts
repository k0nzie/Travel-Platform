import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/**
 * Time-zone helpers for flights (FLT-03, GEN-06). Store every instant in UTC;
 * convert at the edges using the airport's IANA zone (e.g. "Africa/Cairo").
 */

/** "2026-11-05T14:30" entered in the airport's local time -> UTC Date. */
export function localToUtc(localDateTime: string, timeZone: string): Date {
  const dt = DateTime.fromISO(localDateTime, { zone: timeZone });
  if (!dt.isValid) {
    throw new BadRequestException(`Invalid date-time "${localDateTime}" for time zone ${timeZone}`);
  }
  return dt.toUTC().toJSDate();
}

/** UTC Date -> ISO string with the airport's offset, e.g. "2026-11-05T14:30:00.000+02:00". */
export function utcToLocalIso(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timeZone).toISO();
}

/**
 * UTC range covering one calendar day in a zone. Use for "flights departing on
 * 2026-11-05 local time at the departure airport" (FLT-11).
 */
export function localDayRangeUtc(localDate: string, timeZone: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(localDate, { zone: timeZone }).startOf('day');
  if (!start.isValid) throw new BadRequestException(`Invalid date "${localDate}"`);
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}

/** Whole days between now and a future instant, floored (used for cancellation tiers FLT-09 / HTL-10). */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000);
}

/** Date-only "YYYY-MM-DD" -> UTC midnight Date. Use for hotel stays and itinerary dates. */
export function parseDateOnly(value: string): Date {
  const dt = DateTime.fromISO(value, { zone: 'utc' });
  if (!dt.isValid) throw new BadRequestException(`Invalid date "${value}"`);
  return dt.startOf('day').toJSDate();
}

export function addDays(date: Date, days: number): Date {
  return DateTime.fromJSDate(date, { zone: 'utc' }).plus({ days }).toJSDate();
}

export function todayUtc(): Date {
  return DateTime.utc().startOf('day').toJSDate();
}
