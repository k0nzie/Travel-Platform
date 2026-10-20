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

  listAirports(query: AirportQueryDto) {
    const filter: Record<string, any> = {};
    if (query.cityId) filter.cityId = new Types.ObjectId(query.cityId);
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

  listAttractions(query: AttractionQueryDto) {
    const filter: Record<string, any> = {};
    if (query.cityId) filter.cityId = new Types.ObjectId(query.cityId);
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

  /** ITN-26: all airports serving a city. */
  airportsInCity(cityId: string | Types.ObjectId) {
    return this.airportModel.find({ cityId: new Types.ObjectId(String(cityId)) }).lean().exec();
  }

  async getCityById(id: string | Types.ObjectId) {
    const city = Types.ObjectId.isValid(String(id)) ? await this.cityModel.findById(id).lean().exec() : null;
    if (!city) throw new BadRequestException(`Unknown city "${id}"`);
    return city;
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
