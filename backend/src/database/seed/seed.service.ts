import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { existsSync, readFileSync } from 'fs';
import { Model } from 'mongoose';
import { join, resolve } from 'path';
import { Role } from '../../common/constants/enums';
import {
  Airport,
  AirportDocument,
  Attraction,
  AttractionDocument,
  City,
  CityDocument,
  Country,
  CountryDocument,
  Currency,
  CurrencyDocument,
} from '../../modules/reference-data/schemas/reference.schemas';
import { UsersService } from '../../modules/users/users.service';

type Row = Record<string, any>;

/** Returns the first non-empty value among several possible column names. */
const pick = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
};
const str = (v: unknown) => (v === undefined ? undefined : String(v).trim());
const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

/**
 * GEN-12 + ACC-18. Idempotent: safe to run many times (upserts by natural key).
 *
 * Reads JSON arrays from SEED_DATA_DIR (default ./seed-data):
 *   countries.json, cities.json, airports.json, currencies.json, attractions.json
 *
 * Drop the official course datasets into that folder with those names. The loader
 * accepts common column-name variants (e.g. "iata" / "iataCode" / "code") and keeps
 * the dataset's own id in `externalId`. If the official files use different column
 * names, add them to the `pick(...)` calls below.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  constructor(
    @InjectModel(Country.name) private readonly countryModel: Model<CountryDocument>,
    @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    @InjectModel(Airport.name) private readonly airportModel: Model<AirportDocument>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<CurrencyDocument>,
    @InjectModel(Attraction.name) private readonly attractionModel: Model<AttractionDocument>,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async run() {
    const dir = resolve(process.env.SEED_DATA_DIR ?? 'seed-data');
    this.logger.log(`Reading reference data from ${dir}`);

    await this.seedCurrencies(this.load(dir, 'currencies.json'));
    const countries = await this.seedCountries(this.load(dir, 'countries.json'));
    const cities = await this.seedCities(this.load(dir, 'cities.json'), countries);
    await this.seedAirports(this.load(dir, 'airports.json'), cities);
    await this.seedAttractions(this.load(dir, 'attractions.json'), cities);
    await this.seedAdmin();

    // Make sure unique indexes exist before the app is used.
    await Promise.all([
      this.countryModel.syncIndexes(),
      this.cityModel.syncIndexes(),
      this.airportModel.syncIndexes(),
      this.currencyModel.syncIndexes(),
      this.attractionModel.syncIndexes(),
    ]);
    this.logger.log('Seeding finished');
  }

  private load(dir: string, file: string): Row[] {
    const path = join(dir, file);
    if (!existsSync(path)) {
      this.logger.warn(`${file} not found — skipped`);
      return [];
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.items ?? Object.values(parsed)[0]);
    if (!Array.isArray(rows)) throw new Error(`${file} must contain a JSON array`);
    return rows;
  }

  private async seedCurrencies(rows: Row[]) {
    let n = 0;
    for (const row of rows) {
      const code = str(pick(row, 'code', 'currencyCode', 'iso'))?.toUpperCase();
      if (!code) continue;
      await this.currencyModel.updateOne(
        { code },
        { code, name: str(pick(row, 'name', 'currencyName')) ?? code, symbol: str(pick(row, 'symbol')) },
        { upsert: true },
      );
      n++;
    }
    this.logger.log(`Currencies: ${n}`);
  }

  /** Returns lookups by code, name and external id → country doc. */
  private async seedCountries(rows: Row[]) {
    for (const row of rows) {
      const code = str(pick(row, 'code', 'iso2', 'countryCode', 'alpha2', 'country_code'))?.toUpperCase();
      const name = str(pick(row, 'name', 'countryName', 'country'));
      if (!code || !name) continue;
      await this.countryModel.updateOne(
        { code },
        { code, name, externalId: str(pick(row, 'id', '_id', 'countryId')) },
        { upsert: true },
      );
    }
    const all = await this.countryModel.find().lean().exec();
    const byKey = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      byKey.set(c.code.toUpperCase(), c);
      byKey.set(c.name.toLowerCase(), c);
      if (c.externalId) byKey.set(`id:${c.externalId}`, c);
    }
    this.logger.log(`Countries: ${all.length}`);
    return byKey;
  }

  private findCountry(row: Row, countries: Map<string, any>) {
    const ext = str(pick(row, 'countryId', 'country_id'));
    const code = str(pick(row, 'countryCode', 'country_code', 'iso2'));
    const name = str(pick(row, 'country', 'countryName'));
    return (
      (ext && countries.get(`id:${ext}`)) ||
      (code && countries.get(code.toUpperCase())) ||
      (name && (countries.get(name.toUpperCase()) || countries.get(name.toLowerCase())))
    );
  }

  private async seedCities(rows: Row[], countries: Map<string, any>) {
    let skipped = 0;
    for (const row of rows) {
      const name = str(pick(row, 'name', 'cityName', 'city'));
      const country = this.findCountry(row, countries);
      if (!name || !country) {
        skipped++;
        continue;
      }
      await this.cityModel.updateOne(
        { name, countryCode: country.code },
        {
          name,
          countryCode: country.code,
          countryId: country._id,
          externalId: str(pick(row, 'id', '_id', 'cityId')),
          timezone: str(pick(row, 'timezone', 'timeZone', 'tz')),
          latitude: num(pick(row, 'latitude', 'lat')),
          longitude: num(pick(row, 'longitude', 'lng', 'lon')),
        },
        { upsert: true },
      );
    }
    const all = await this.cityModel.find().lean().exec();
    const byKey = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      byKey.set(`${c.name.toLowerCase()}|${c.countryCode}`, c);
      if (c.externalId) byKey.set(`id:${c.externalId}`, c);
    }
    this.logger.log(`Cities: ${all.length}${skipped ? ` (skipped ${skipped} rows without a known country)` : ''}`);
    return byKey;
  }

  private findCity(row: Row, cities: Map<string, any>) {
    const ext = str(pick(row, 'cityId', 'city_id'));
    if (ext && cities.get(`id:${ext}`)) return cities.get(`id:${ext}`);
    const name = str(pick(row, 'city', 'cityName', 'municipality'));
    const code = str(pick(row, 'countryCode', 'country_code', 'iso_country', 'country'))?.toUpperCase();
    return name && code ? cities.get(`${name.toLowerCase()}|${code}`) : undefined;
  }

  private async seedAirports(rows: Row[], cities: Map<string, any>) {
    let n = 0;
    let skipped = 0;
    for (const row of rows) {
      const iataCode = str(pick(row, 'iataCode', 'iata', 'iata_code', 'code'))?.toUpperCase();
      const city = this.findCity(row, cities);
      const timezone = str(pick(row, 'timezone', 'timeZone', 'tz', 'tz_database_time_zone')) ?? city?.timezone;
      if (!iataCode || !city || !timezone) {
        skipped++;
        continue;
      }
      await this.airportModel.updateOne(
        { iataCode },
        {
          iataCode,
          name: str(pick(row, 'name', 'airportName')) ?? iataCode,
          cityId: city._id,
          cityName: city.name,
          countryCode: city.countryCode,
          timezone,
          externalId: str(pick(row, 'id', '_id', 'airportId')),
        },
        { upsert: true },
      );
      n++;
    }
    this.logger.log(`Airports: ${n}${skipped ? ` (skipped ${skipped} rows missing IATA, city or time zone)` : ''}`);
  }

  private async seedAttractions(rows: Row[], cities: Map<string, any>) {
    let n = 0;
    for (const row of rows) {
      const name = str(pick(row, 'name', 'attractionName', 'title'));
      if (!name) continue;
      const city = this.findCity(row, cities);
      await this.attractionModel.updateOne(
        { name, cityId: city?._id ?? null },
        {
          name,
          cityId: city?._id,
          cityName: city?.name ?? str(pick(row, 'city', 'cityName')),
          countryCode: city?.countryCode ?? str(pick(row, 'countryCode', 'country'))?.toUpperCase(),
          category: str(pick(row, 'category', 'type')),
          description: str(pick(row, 'description')),
          externalId: str(pick(row, 'id', '_id', 'attractionId')),
        },
        { upsert: true },
      );
      n++;
    }
    this.logger.log(`Attractions: ${n}`);
  }

  /** ACC-18: admin accounts exist only through seeding. */
  private async seedAdmin() {
    const email = this.config.get<string>('admin.email');
    const password = this.config.get<string>('admin.password');
    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — admin account not seeded');
      return;
    }
    if (await this.users.emailExists(email)) {
      this.logger.log(`Admin ${email} already exists`);
      return;
    }
    await this.users.create({
      name: this.config.get<string>('admin.name'),
      email,
      password,
      role: Role.Admin,
    });
    this.logger.log(`Admin ${email} created`);
  }
}
