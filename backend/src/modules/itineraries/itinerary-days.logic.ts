import { BadRequestException } from '@nestjs/common';
import { addDays } from '../../common/utils/time.util';

/**
 * ITN-08 / ITN-09: pure day logic, no database. The array order is the source of truth;
 * numbers, dates and city groups are always derived from it, so adding, deleting or
 * reordering days can never leave them inconsistent.
 */

export interface DayLike {
  _id: unknown;
  cityId: unknown;
  cityCode: string;
  cityName: string;
  countryCode: string;
  title?: string;
  notes?: string;
}

export interface DerivedDay {
  id: string;
  dayNumber: number;
  date: string;
  cityId: string;
  cityCode: string;
  cityName: string;
  countryCode: string;
  title: string | null;
  notes: string | null;
}

export interface CityGroup {
  cityId: string;
  cityCode: string;
  cityName: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  firstDayNumber: number;
  lastDayNumber: number;
  dayIds: string[];
  /** Number of days spent in the city in this stretch. */
  dayCount: number;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** ITN-08: day N happens on startDate + (N - 1). */
export function deriveDays(startDate: Date, days: DayLike[]): DerivedDay[] {
  return days.map((d, index) => ({
    id: String(d._id),
    dayNumber: index + 1,
    date: isoDay(addDays(startDate, index)),
    cityId: String(d.cityId),
    cityCode: d.cityCode,
    cityName: d.cityName,
    countryCode: d.countryCode,
    title: d.title ?? null,
    notes: d.notes ?? null,
  }));
}

/** ITN-09: consecutive days in the same city form one group (Cairo, Cairo, Luxor, Cairo -> 3 groups). */
export function groupByCity(days: DerivedDay[]): CityGroup[] {
  const groups: CityGroup[] = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && last.cityId === day.cityId) {
      last.endDate = day.date;
      last.lastDayNumber = day.dayNumber;
      last.dayIds.push(day.id);
      last.dayCount++;
    } else {
      groups.push({
        cityId: day.cityId,
        cityCode: day.cityCode,
        cityName: day.cityName,
        countryCode: day.countryCode,
        startDate: day.date,
        endDate: day.date,
        firstDayNumber: day.dayNumber,
        lastDayNumber: day.dayNumber,
        dayIds: [day.id],
        dayCount: 1,
      });
    }
  }
  return groups;
}

/** ITN-08: the new order must contain every existing day exactly once. Returns the reordered array. */
export function reorderDays<T extends { _id: unknown }>(days: T[], dayIds: string[]): T[] {
  const byId = new Map(days.map((d) => [String(d._id), d]));
  const unique = new Set(dayIds);
  if (dayIds.length !== days.length || unique.size !== dayIds.length || dayIds.some((id) => !byId.has(id))) {
    throw new BadRequestException({
      message: 'dayIds must list every day of the itinerary exactly once',
      errors: [{ field: 'dayIds', messages: ['Must be a permutation of the current day ids'] }],
    });
  }
  return dayIds.map((id) => byId.get(id)!);
}

/** 1-based insert position, clamped to the end when omitted. */
export function insertIndex(position: number | undefined, length: number): number {
  if (position === undefined) return length;
  if (position < 1 || position > length + 1) {
    throw new BadRequestException({
      message: `position must be between 1 and ${length + 1}`,
      errors: [{ field: 'position', messages: [`Must be between 1 and ${length + 1}`] }],
    });
  }
  return position - 1;
}

/** "HH:mm" -> minutes, for comparing activity times. */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
