import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { localToUtc } from '../../common/utils/time.util';
import { CabinDto } from './dto/flights.dto';
import { CabinType } from './schemas/flight.schema';

/** Luxon otherwise silently normalizes DST gaps and chooses one side of ambiguous times. */
export function airportLocalToUtc(local: string, zone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new BadRequestException('Use local YYYY-MM-DDTHH:mm without offset');
  const dt = DateTime.fromISO(local, { zone });
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== local || dt.getPossibleOffsets().length !== 1) {
    throw new BadRequestException('Invalid or ambiguous airport local time');
  }
  return localToUtc(local, zone);
}

export function validateCabins(cabins: CabinDto[]) {
  if (!Array.isArray(cabins) || !cabins.length || cabins.length > 3 || cabins.some((c) => !c ||
      !Object.values(CabinType).includes(c.cabin) || !Number.isSafeInteger(c.capacity) || c.capacity < 0 || c.capacity > 1000 ||
      !Number.isFinite(c.price) || c.price < 0) || new Set(cabins.map((c) => c.cabin)).size !== cabins.length) {
    throw new BadRequestException('At least one cabin, with unique cabin types, is required');
  }
}

/** Strict calendar date; shared localDayRangeUtc performs the actual timezone conversion. */
export function validateLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !DateTime.fromISO(value, { zone: 'UTC' }).isValid) {
    throw new BadRequestException('Use a valid YYYY-MM-DD calendar date');
  }
}
