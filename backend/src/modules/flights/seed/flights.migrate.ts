import { Types } from 'mongoose';
import { utcToLocalIso } from '../../../common/utils/time.util';
import { AirlineStatus } from '../schemas/airline.schema';
import { CabinType, FlightStatus } from '../schemas/flight.schema';
import { defaultBaggagePolicy, defaultCancellationTiers } from './flights.seed';

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
const flightStatuses = new Map(Object.values(FlightStatus).map((s) => [key(s), s]));
const cabinTypes = new Map(Object.values(CabinType).map((c) => [key(c), c]));
const airlineStatuses = new Map(Object.values(AirlineStatus).map((s) => [key(s), s]));

/** Pure: the $set needed to bring a legacy flight to the current shape, or null when current. Inventory is carried over, never reset. */
export function flightPatch(flight: any, newId = () => new Types.ObjectId(), airlineIds?: Set<string>) {
  const $set: Record<string, unknown> = {}, problems: string[] = [], conflicts: string[] = [];
  if (typeof flight.airlineId === 'string' && airlineIds) {
    if (/^[0-9a-f]{24}$/i.test(flight.airlineId) && airlineIds.has(flight.airlineId.toLowerCase())) $set.airlineId = new Types.ObjectId(flight.airlineId);
    else conflicts.push(`unresolvable airlineId ${JSON.stringify(flight.airlineId)}`);
  }
  const status = flightStatuses.get(key(flight.status ?? FlightStatus.Scheduled));
  if (!status) problems.push(`unknown status ${flight.status}`);
  else if (status !== flight.status) $set.status = status;
  if (Array.isArray(flight.cabins)) {
    let changed = false;
    const cabins = flight.cabins.map((c: any) => {
      const cabin = cabinTypes.get(key(c.cabin));
      if (!cabin) { problems.push(`unknown cabin ${c.cabin}`); return c; }
      if (cabin !== c.cabin || !c._id || c.held === undefined || c.booked === undefined) changed = true;
      return { ...c, cabin, _id: c._id ?? newId(), held: c.held ?? 0, booked: c.booked ?? 0 };
    });
    if (changed) $set.cabins = cabins;
  }
  if (flight.departureAt instanceof Date && flight.originTimezone) {
    const day = utcToLocalIso(flight.departureAt, flight.originTimezone).slice(0, 10);
    if (day !== flight.departureDay) $set.departureDay = day;
  } else if (!flight.departureDay) problems.push('cannot derive departureDay');
  return { $set: Object.keys($set).length ? $set : null, problems, conflicts };
}

export function airlinePatch(airline: any) {
  const $set: Record<string, unknown> = {}, problems: string[] = [];
  const status = airline.status === undefined ? AirlineStatus.Active : airlineStatuses.get(key(airline.status));
  if (!status) problems.push(`unknown status ${airline.status}`);
  else if (status !== airline.status) $set.status = status;
  if (!airline.baggagePolicy) $set.baggagePolicy = defaultBaggagePolicy;
  if (!airline.cancellationTiers) $set.cancellationTiers = defaultCancellationTiers;
  return { $set: Object.keys($set).length ? $set : null, problems };
}

/**
 * Idempotent legacy migration over raw collections (bypasses schema casting so legacy values stay readable).
 * Each write is guarded by the originally read value, so a concurrent booking change is skipped (reported), never overwritten.
 * dryRun reports what would change and writes nothing.
 */
export async function migrateLegacyFlights(airlines: any, flights: any, dryRun = false) {
  const report = { dryRun, airlinesUpdated: 0, flightsUpdated: 0, conflicts: [] as string[], problems: [] as string[] };
  const run = async (col: any, patch: (d: any) => { $set: Record<string, unknown> | null; problems: string[]; conflicts?: string[] }, label: string,
    guard: (d: any) => object, count: 'airlinesUpdated' | 'flightsUpdated') => {
    for await (const doc of col.collection.find({})) {
      const { $set, problems, conflicts } = patch(doc);
      conflicts?.forEach((c) => report.conflicts.push(`${label} ${doc._id}: ${c}`));
      if (conflicts?.length) continue;
      problems.forEach((p) => report.problems.push(`${label} ${doc._id}: ${p}`));
      if (!$set) continue;
      if (dryRun) { report[count]++; continue; }
      try {
        const res = await col.collection.updateOne({ _id: doc._id, ...guard(doc) }, { $set });
        if (res.modifiedCount) report[count]++; else report.conflicts.push(`${label} ${doc._id}: changed concurrently, rerun`);
      } catch (e) { report.conflicts.push(`${label} ${doc._id}: ${(e as Error).message}`); }
    }
  };
  const was = (v: unknown) => (v === undefined ? { $exists: false } : v);
  await run(airlines, airlinePatch, 'airline', (d) => ({ status: was(d.status), baggagePolicy: was(d.baggagePolicy), cancellationTiers: was(d.cancellationTiers) }), 'airlinesUpdated');
  const airlineIds = new Set<string>();
  for await (const a of airlines.collection.find({})) airlineIds.add(String(a._id).toLowerCase());
  await run(flights, (d) => flightPatch(d, undefined, airlineIds), 'flight', (d) => ({ airlineId: was(d.airlineId), cabins: was(d.cabins), departureDay: was(d.departureDay), status: was(d.status) }), 'flightsUpdated');
  return report;
}

/**
 * Seed orchestration: migrate legacy rows via raw collections first, abort on problems/conflicts,
 * and only then create collections/indexes and seed samples. Dry-run performs no DDL and no writes.
 */
export async function runFlightSeed(airlines: any, flights: any, seed: () => Promise<unknown>, dryRun = false, log: (...a: unknown[]) => void = console.log) {
  const report = await migrateLegacyFlights(airlines, flights, dryRun);
  log('migration', report);
  if (report.problems.length || report.conflicts.length) {
    throw new Error(`flight migration aborted: ${report.problems.length} problem(s), ${report.conflicts.length} conflict(s); fix and rerun`);
  }
  if (dryRun) return { report, seeded: false };
  for (const model of [airlines, flights]) { await model.createCollection(); await model.createIndexes(); }
  log(await seed());
  return { report, seeded: true };
}
