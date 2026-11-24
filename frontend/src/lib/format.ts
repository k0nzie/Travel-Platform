/**
 * Formatting shared by every page so numbers, money and dates look the same everywhere.
 * Money from the backend is always in minor units (cents): formatMoney(12500, 'USD') -> "$125.00".
 */

const LOCALE = 'en-GB';

/** Number of decimal places a currency uses (USD 2, JPY 0, KWD 3). */
function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMoney(amountMinor: number | null | undefined, currency = 'USD'): string {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(amountMinor)) return '—';
  const digits = currencyDigits(currency);
  const major = amountMinor / 10 ** digits;
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: digits }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

/** Converts a major-unit input (e.g. "125.50") into minor units for the API. */
export function toMinor(major: number | string, currency = 'USD'): number {
  return Math.round(Number(major) * 10 ** currencyDigits(currency));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A plain "2026-12-01" is a calendar day, not a moment: read it as UTC so it never shifts a day.
  return DATE_ONLY.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
}

/** "1 Dec 2026". Calendar days (YYYY-MM-DD) are shown exactly as stored. */
export function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return '—';
  const date = toDate(value);
  const timeZone = typeof value === 'string' && DATE_ONLY.test(value) ? 'UTC' : options.timeZone;
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
    timeZone,
  }).format(date);
}

/**
 * "1 Dec 2026, 09:30". Pass the airport's IANA time zone for flight times (GEN-06):
 * formatDateTime(flight.departureAt, flight.originTimezone).
 */
export function formatDateTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(toDate(value));
}

/** "09:30" in the given time zone. */
export function formatTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone }).format(toDate(value));
}

/** 275 -> "4h 35m". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "3 minutes ago", "in 2 days". */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const seconds = Math.round((toDate(value).getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** pluralize(1, 'night') -> "1 night", pluralize(3, 'night') -> "3 nights". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Today as YYYY-MM-DD in the user's own time zone (for date inputs' min). */
export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
