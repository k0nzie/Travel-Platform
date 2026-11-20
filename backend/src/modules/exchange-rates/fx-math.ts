/**
 * ITN-18: pure currency maths, kept separate so it can be unit-tested without a database.
 * Rates come from one snapshot with base B: rates[X] = units of X per 1 B.
 */

/** Units of `to` per 1 unit of `from`, or null when either currency is missing from the snapshot. */
export function crossRate(rates: Record<string, number>, base: string, from: string, to: string): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const fromRate = f === base ? 1 : rates[f];
  const toRate = t === base ? 1 : rates[t];
  if (!isUsableRate(fromRate) || !isUsableRate(toRate)) return null;
  return toRate / fromRate;
}

/** Converts an integer minor-unit amount and rounds to the nearest minor unit. */
export function convertMinor(amountMinor: number, rate: number): number {
  return Math.round(amountMinor * rate);
}

export const isUsableRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
