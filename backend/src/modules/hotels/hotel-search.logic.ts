import { BadRequestException } from '@nestjs/common';

import { parseDateOnly, todayUtc } from '../../common/utils/time.util';

type Period = { startDate: string; endDate: string };
export type SearchableRoom = {
  maxOccupancy: number;
  pricePerNightMinor: number;
  availabilityRanges: Period[];
  blockedRanges: Period[];
};

/** Strict date-only validation, using the platform's UTC-day convention. */
export function validateHotelStay(checkIn: string, checkOut: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new BadRequestException('Dates must be YYYY-MM-DD');
  }
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (
    start.toISOString().slice(0, 10) !== checkIn ||
    end.toISOString().slice(0, 10) !== checkOut ||
    start < todayUtc() ||
    end <= start
  ) {
    throw new BadRequestException('Check-in must not be in the past and check-out must be later');
  }
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Multiple adjacent published ranges may cover the same continuous stay. */
export function coversHotelStay(ranges: readonly Period[], checkIn: string, checkOut: string): boolean {
  let cursor = checkIn;
  for (const range of [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (range.startDate > cursor) return false;
    if (range.endDate > cursor) cursor = range.endDate;
    if (cursor >= checkOut) return true;
  }
  return false;
}

/** Half-open overlap: [start, end), so adjoining ranges do not overlap. */
export function hasHotelBlock(blocks: readonly Period[], checkIn: string, checkOut: string): boolean {
  return blocks.some((block) => block.startDate < checkOut && block.endDate > checkIn);
}

export function isScheduleAvailable(room: SearchableRoom, checkIn: string, checkOut: string): boolean {
  return (
    coversHotelStay(room.availabilityRanges ?? [], checkIn, checkOut) &&
    !hasHotelBlock(room.blockedRanges ?? [], checkIn, checkOut)
  );
}

/**
 * Lowest-priced room that can participate in a feasible group of exactly `count` rooms.
 * Example: 7 guests/2 rooms with capacities 1, 3, 4 cannot use the capacity-1 room.
 * A booking/hold conflict check must be integrated before these results are fully bookable.
 */
export function cheapestFeasibleRoomPrice<T extends Pick<SearchableRoom, 'maxOccupancy' | 'pricePerNightMinor'>>(
  rooms: readonly T[],
  count: number,
  guests: number,
): number | null {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !Number.isSafeInteger(guests) ||
    guests < 1 ||
    rooms.length < count
  ) {
    return null;
  }
  const byCapacity = [...rooms].sort((a, b) => b.maxOccupancy - a.maxOccupancy);
  const prefix = [0];
  for (const room of byCapacity) prefix.push(prefix[prefix.length - 1] + room.maxOccupancy);
  if (prefix[count] < guests) return null;

  let cheapest: number | null = null;
  byCapacity.forEach((room, index) => {
    const otherCapacity = count === 1 ? 0 : index < count - 1 ? prefix[count] - room.maxOccupancy : prefix[count - 1];
    if (room.maxOccupancy + otherCapacity >= guests) {
      cheapest = cheapest === null ? room.pricePerNightMinor : Math.min(cheapest, room.pricePerNightMinor);
    }
  });
  return cheapest;
}
