import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { escapeRegex, paginate } from '../../common/utils/paginate';
import { AirportQueryDto, AttractionQueryDto, CityQueryDto, CountryQueryDto } from './dto/reference-query.dto';
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
} from './schemas/reference.schemas';

/**
 * Read access to the seeded reference data, plus validation helpers other
 * modules use so they only accept known airports, cities, countries and currencies.
 */
@Injectable()
export class ReferenceDataService {
  private currencyCache: { codes: Set<string>; loadedAt: number } | null = null;

  constructor(
    @InjectModel(Country.name) private readonly countryModel: Model<CountryDocument>,
    @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    @InjectModel(Airport.name) private readonly airportModel: Model<AirportDocument>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<CurrencyDocument>,
    @InjectModel(Attraction.name) private readonly attractionModel: Model<AttractionDocument>,
  ) {}

  // ---------- listing (public endpoints) ----------

  listCountries(query: CountryQueryDto) {
    const filter: Record<string, any> = {};
    if (query.q) {
      const rx = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: rx }, { code: rx }];
    }
    return this.countryModel.find(filter).sort({ name: 1 }).lean().exec();
  }

  listCities(query: CityQueryDto) {
    const filter: Record<string, any> = {};
    if (query.countryCode) filter.countryCode = query.countryCode;
    if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
    return paginate(this.cityModel, filter, { page: query.page, limit: query.limit, sort: { name: 1 } });
  }

  async listAirports(query: AirportQueryDto) {
    const filter: Record<string, any> = {};
    if (query.cityId) filter.cityId = (await this.resolveCity(query.cityId))._id;
    if (query.countryCode) filter.countryCode = query.countryCode;
    if (query.q) {
      const rx = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ iataCode: rx }, { name: rx }, { cityName: rx }];
    }
    return paginate(this.airportModel, filter, { page: query.page, limit: query.limit, sort: { iataCode: 1 } });
  }

  listCurrencies() {
    return this.currencyModel.find().sort({ code: 1 }).lean().exec();
  }

  async listAttractions(query: AttractionQueryDto) {
    const filter: Record<string, any> = {};
    if (query.cityId) filter.cityId = (await this.resolveCity(query.cityId))._id;
    if (query.countryCode) filter.countryCode = query.countryCode;
    if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
    return paginate(this.attractionModel, filter, { page: query.page, limit: query.limit, sort: { name: 1 } });
  }

  // ---------- lookups / validation helpers for other modules ----------

  async getAirportById(id: string) {
    const airport = Types.ObjectId.isValid(id) ? await this.airportModel.findById(id).lean().exec() : null;
    if (!airport) throw new NotFoundException('Airport not found');
    return airport;
  }

  /** FLT-02: only airports from the seeded list are accepted. Accepts an _id or an IATA code. */
  async resolveAirport(idOrIata: string) {
    const airport = Types.ObjectId.isValid(idOrIata)
      ? await this.airportModel.findById(idOrIata).lean().exec()
      : await this.airportModel.findOne({ iataCode: idOrIata.toUpperCase() }).lean().exec();
    if (!airport) throw new BadRequestException(`Unknown airport "${idOrIata}"`);
    return airport;
  }

  /** ITN-26: all airports serving a city (official city_id or _id). */
  async airportsInCity(cityIdOrCode: string | Types.ObjectId) {
    const city = await this.resolveCity(cityIdOrCode);
    return this.airportModel.find({ cityId: city._id }).lean().exec();
  }

  /**
   * GEN-12: a city from the official list, by its city_id ("cairo") or its _id.
   * Hotels (HTL-01, HTL-11) and itinerary days (ITN-05) must validate cities through this.
   */
  async resolveCity(idOrCode: string | Types.ObjectId) {
    const key = String(idOrCode).trim();
    const city = /^[a-f\d]{24}$/i.test(key)
      ? await this.cityModel.findById(key).lean().exec()
      : await this.cityModel.findOne({ code: key.toLowerCase() }).lean().exec();
    if (!city) throw new BadRequestException(`Unknown city "${key}"`);
    return city;
  }

  /** Same as resolveCity (kept for existing callers). */
  getCityById(idOrCode: string | Types.ObjectId) {
    return this.resolveCity(idOrCode);
  }

  /** An attraction from the official list, by its attraction_id ("att-1") or its _id. */
  async resolveAttraction(idOrCode: string | Types.ObjectId) {
    const key = String(idOrCode).trim();
    const attraction = /^[a-f\d]{24}$/i.test(key)
      ? await this.attractionModel.findById(key).lean().exec()
      : await this.attractionModel.findOne({ code: key.toLowerCase() }).lean().exec();
    if (!attraction) throw new BadRequestException(`Unknown attraction "${key}"`);
    return attraction;
  }

  async assertCountryCodes(codes: string[]) {
    const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
    const found = await this.countryModel.countDocuments({ code: { $in: unique } }).exec();
    if (found !== unique.length) throw new BadRequestException('One or more countries are not in the supported list');
    return unique;
  }

  /** ACC-09 / ITN-18: the supported currency list (cached for 5 minutes). */
  async isSupportedCurrency(code: string) {
    if (!this.currencyCache || Date.now() - this.currencyCache.loadedAt > 5 * 60_000) {
      const docs = await this.currencyModel.find({}, { code: 1 }).lean().exec();
      this.currencyCache = { codes: new Set(docs.map((d) => d.code)), loadedAt: Date.now() };
    }
    return this.currencyCache.codes.has(code.toUpperCase());
  }

  async assertSupportedCurrency(code: string) {
    if (!(await this.isSupportedCurrency(code))) {
      throw new BadRequestException({
        message: `Currency "${code}" is not supported`,
        errors: [{ field: 'currency', messages: [`Currency "${code}" is not supported`] }],
      });
    }
    return code.toUpperCase();
  }
}
