import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { convertMinor, crossRate, isUsableRate } from './fx-math';
import { ExchangeRate, ExchangeRateDocument } from './schemas/exchange-rate.schema';

export interface RateSnapshot {
  base: string;
  rates: Record<string, number>;
  ratesAt: Date;
  /** true when today's fetch failed and an older cached snapshot was used (fallback). */
  stale: boolean;
}

export interface Converter {
  /** Converts minor units from `from` into the display currency. */
  toDisplay(amountMinor: number, from: string): number;
  displayCurrency: string;
  ratesAt: Date | null;
  stale: boolean;
}

/** One base for the whole cache: every other pair is a cross rate, so one API call per day is enough. */
const CACHE_BASE = 'USD';

/**
 * ITN-18: FXRatesAPI integration through the backend only (the API key never reaches the client).
 * - Daily DB cache: the first request of a UTC day fetches and stores the snapshot; later requests reuse it.
 * - Fallback: if FXRatesAPI fails, the most recent stored snapshot is used and flagged `stale`.
 * - Errors: unsupported currency -> 400; no rates at all -> 503 FX_UNAVAILABLE.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private inflight: Promise<RateSnapshot> | null = null;

  constructor(
    @InjectModel(ExchangeRate.name) private readonly rateModel: Model<ExchangeRateDocument>,
    private readonly reference: ReferenceDataService,
    private readonly config: ConfigService,
  ) {}

  /** Refresh the cache once a day so the first user of the day does not wait for the API. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshDaily() {
    try {
      await this.fetchAndStore();
    } catch (err) {
      this.logger.warn(`Daily FX refresh failed: ${(err as Error).message}`);
    }
  }

  /** Today's snapshot from the DB cache, fetched from FXRatesAPI if missing, else the latest cached one. */
  async getSnapshot(): Promise<RateSnapshot> {
    const today = new Date().toISOString().slice(0, 10);
    const cached = await this.rateModel.findOne({ base: CACHE_BASE, day: today }).lean().exec();
    if (cached) return { base: cached.base, rates: cached.rates, ratesAt: cached.ratesAt, stale: false };

    // Several concurrent requests share one API call.
    if (!this.inflight) {
      this.inflight = this.fetchAndStore().finally(() => (this.inflight = null));
    }
    try {
      return await this.inflight;
    } catch (err) {
      this.logger.warn(`FXRatesAPI unavailable, using cached rates: ${(err as Error).message}`);
      const latest = await this.rateModel.findOne({ base: CACHE_BASE }).sort({ ratesAt: -1 }).lean().exec();
      if (latest) return { base: latest.base, rates: latest.rates, ratesAt: latest.ratesAt, stale: true };
      throw new HttpException(
        {
          message: 'Exchange rates are currently unavailable. Please try again later.',
          code: 'FX_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Public helper endpoint: rates for one base, optionally limited to some currencies. */
  async latest(base: string, symbols?: string[]) {
    const from = await this.reference.assertSupportedCurrency(base);
    const wanted = symbols?.length
      ? await Promise.all(symbols.map((s) => this.reference.assertSupportedCurrency(s)))
      : null;
    const snap = await this.getSnapshot();
    const codes = wanted ?? Object.keys(snap.rates);
    const rates: Record<string, number> = {};
    for (const code of codes) {
      const rate = crossRate(snap.rates, snap.base, from, code);
      if (rate !== null) rates[code] = rate;
    }
    return { base: from, ratesAt: snap.ratesAt, stale: snap.stale, rates };
  }

  /** Public helper endpoint: convert one amount (minor units). */
  async convert(amountMinor: number, from: string, to: string) {
    const converter = await this.converter(to);
    const source = await this.reference.assertSupportedCurrency(from);
    return {
      from: source,
      to: converter.displayCurrency,
      amountMinor,
      convertedMinor: converter.toDisplay(amountMinor, source),
      rate: this.rateOrThrow(await this.getSnapshot(), source, converter.displayCurrency),
      ratesAt: converter.ratesAt,
      stale: converter.stale,
    };
  }

  /**
   * Builds a converter into `displayCurrency` for amounts in `sourceCurrencies`. No API call is made
   * when every amount is already in the display currency (or there are none), so budgets still work if FXRatesAPI is down and nothing needs converting.
   */
  async converter(displayCurrency: string, sourceCurrencies: string[] = []): Promise<Converter> {
    const display = await this.reference.assertSupportedCurrency(displayCurrency);
    const needsRates = sourceCurrencies.some((c) => c.toUpperCase() !== display);
    if (!needsRates) {
      return { toDisplay: (amount) => amount, displayCurrency: display, ratesAt: null, stale: false };
    }
    const snap = await this.getSnapshot();
    for (const c of new Set(sourceCurrencies.map((s) => s.toUpperCase()))) this.rateOrThrow(snap, c, display);
    return {
      toDisplay: (amountMinor, from) => convertMinor(amountMinor, this.rateOrThrow(snap, from, display)),
      displayCurrency: display,
      ratesAt: snap.ratesAt,
      stale: snap.stale,
    };
  }

  private rateOrThrow(snap: RateSnapshot, from: string, to: string) {
    const rate = crossRate(snap.rates, snap.base, from, to);
    if (rate === null) {
      throw new HttpException(
        { message: `No exchange rate available for ${from} -> ${to}`, code: 'FX_RATE_MISSING' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return rate;
  }

  /** Calls FXRatesAPI `/latest` and upserts today's snapshot. */
  private async fetchAndStore(): Promise<RateSnapshot> {
    const baseUrl = this.config.get<string>('fxRates.baseUrl') ?? 'https://api.fxratesapi.com';
    const apiKey = this.config.get<string>('fxRates.apiKey');
    const url = new URL('/latest', baseUrl);
    url.searchParams.set('base', CACHE_BASE);
    if (apiKey) url.searchParams.set('api_key', apiKey);

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`FXRatesAPI responded ${res.status}`);
    const body = (await res.json()) as { success?: boolean; rates?: Record<string, unknown>; date?: string };
    if (body.success === false || !body.rates) throw new Error('FXRatesAPI returned no rates');

    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(body.rates)) if (isUsableRate(value)) rates[code.toUpperCase()] = value;
    if (!Object.keys(rates).length) throw new Error('FXRatesAPI returned no usable rates');

    const reported = body.date ? new Date(body.date) : new Date();
    const ratesAt = Number.isNaN(reported.getTime()) ? new Date() : reported;
    const day = new Date().toISOString().slice(0, 10);
    await this.rateModel.updateOne({ base: CACHE_BASE, day }, { $set: { rates, ratesAt } }, { upsert: true }).exec();
    return { base: CACHE_BASE, rates, ratesAt, stale: false };
  }
}
