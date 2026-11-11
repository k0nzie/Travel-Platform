import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { escapeRegex, paginate, toPage } from '../../common/utils/paginate';
import { addDays, parseDateOnly, todayUtc } from '../../common/utils/time.util';
import { FlightsService } from '../flights/flights.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { publicAuthor, UsersService } from '../users/users.service';
import {
  AddDayDto,
  CloneItineraryDto,
  CreateItineraryDto,
  ItineraryFlightSearchDto,
  ItineraryHotelSearchDto,
  MyItinerariesQueryDto,
  PublicItinerarySearchDto,
  PublicItinerarySort,
  ReorderDaysDto,
  UpdateDayDto,
  UpdateItineraryDto,
} from './dto/itinerary.dto';
import { insertIndex, isoDay, reorderDays } from './itinerary-days.logic';
import { ItineraryHooksService } from './itinerary-hooks.service';
import { ItineraryItemsService } from './itinerary-items.service';
import { cloneInfo, derive, itinerarySummary } from './itinerary-response';
import { Itinerary, ItineraryDocument, ItineraryVisibility } from './schemas/itinerary.schema';

/** Upper bound on trip length, so one request cannot create an unbounded document. */
export const MAX_DAYS = 365;

/**
 * Itinerary CRUD + visibility (ITN-01, ITN-03, ITN-20), days (ITN-05, ITN-07, ITN-08, ITN-09),
 * public search and clone (ITN-21), and hotel / flight search from the itinerary (ITN-25, ITN-26).
 */
@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraries: Model<ItineraryDocument>,
    private readonly items: ItineraryItemsService,
    private readonly reference: ReferenceDataService,
    private readonly usersService: UsersService,
    private readonly flights: FlightsService,
    private readonly hooks: ItineraryHooksService,
  ) {}

  // ---------- ITN-01 / ITN-03 / ITN-20 ----------

  async create(user: AuthUser, dto: CreateItineraryDto) {
    const countryCodes = await this.reference.assertCountryCodes(dto.countryCodes);
    const startDate = this.futureStart(dto.startDate);
    const budgetCurrency = dto.budgetCurrency
      ? await this.reference.assertSupportedCurrency(dto.budgetCurrency)
      : undefined;
    const visibility = dto.visibility ?? ItineraryVisibility.Private;
    const doc = await this.itineraries.create({
      ownerId: new Types.ObjectId(user.id),
      title: dto.title,
      description: dto.description,
      countryCodes,
      startDate,
      visibility,
      budgetCurrency,
      publishedAt: visibility === ItineraryVisibility.Public ? new Date() : undefined,
      days: [],
    });
    return this.detail(doc.toObject(), { includeBudgets: true });
  }

  async listMine(user: AuthUser, q: MyItinerariesQueryDto) {
    const filter: Record<string, unknown> = { ownerId: new Types.ObjectId(user.id) };
    if (q.visibility) filter.visibility = q.visibility;
    if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
    const page = await paginate(this.itineraries, filter, {
      page: q.page,
      limit: q.limit,
      sort: { updatedAt: -1, _id: -1 },
    });
    return { ...page, items: page.items.map(itinerarySummary) };
  }

  async getMine(user: AuthUser, id: string) {
    const it = await this.items.ownedItinerary(user, id);
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  async update(user: AuthUser, id: string, dto: UpdateItineraryDto) {
    const it = await this.items.ownedItinerary(user, id);
    if (dto.title !== undefined) it.title = dto.title;
    if (dto.description !== undefined) it.description = dto.description;
    if (dto.startDate !== undefined) it.startDate = this.futureStart(dto.startDate);
    if (dto.budgetCurrency !== undefined) {
      it.budgetCurrency = await this.reference.assertSupportedCurrency(dto.budgetCurrency);
    }
    if (dto.countryCodes !== undefined) {
      const codes = await this.reference.assertCountryCodes(dto.countryCodes);
      const used = [...new Set(it.days.map((d) => d.countryCode))].filter((c) => !codes.includes(c));
      if (used.length) {
        throw new BadRequestException({
          message: `Countries ${used.join(', ')} are still used by some days`,
          errors: [{ field: 'countryCodes', messages: [`Remove or change the days in ${used.join(', ')} first`] }],
        });
      }
      it.countryCodes = codes;
    }
    // ITN-20: public <-> private
    if (dto.visibility !== undefined && dto.visibility !== it.visibility) {
      it.visibility = dto.visibility;
      it.publishedAt = dto.visibility === ItineraryVisibility.Public ? new Date() : undefined;
    }
    await it.save();
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  async remove(user: AuthUser, id: string) {
    const it = await this.items.ownedItinerary(user, id);
    await this.items.removeAllContents(it._id);
    await this.itineraries.deleteOne({ _id: it._id }).exec();
    return { deleted: true };
  }

  // ---------- days: ITN-05, ITN-07, ITN-08, ITN-09 ----------

  async addDay(user: AuthUser, id: string, dto: AddDayDto) {
    const it = await this.items.ownedItinerary(user, id);
    if (it.days.length >= MAX_DAYS) throw new BadRequestException(`An itinerary can have at most ${MAX_DAYS} days`);
    const index = insertIndex(dto.position, it.days.length);
    const city = await this.reference.resolveCity(dto.cityId);
    it.days.splice(index, 0, {
      cityId: city._id,
      cityCode: city.code,
      cityName: city.name,
      countryCode: city.countryCode,
      title: dto.title,
      notes: dto.notes,
    } as any);
    this.includeCountry(it, city.countryCode);
    await it.save();
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  async updateDay(user: AuthUser, id: string, dayId: string, dto: UpdateDayDto) {
    const it = await this.items.ownedItinerary(user, id);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found in this itinerary');
    if (dto.cityId !== undefined) {
      const city = await this.reference.resolveCity(dto.cityId);
      Object.assign(day, {
        cityId: city._id,
        cityCode: city.code,
        cityName: city.name,
        countryCode: city.countryCode,
      });
      this.includeCountry(it, city.countryCode);
    }
    if (dto.title !== undefined) day.title = dto.title;
    if (dto.notes !== undefined) day.notes = dto.notes;
    await it.save();
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  /** ITN-07: later days move up one number and one date; the day's activities and budgets are deleted. */
  async deleteDay(user: AuthUser, id: string, dayId: string) {
    const it = await this.items.ownedItinerary(user, id);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found in this itinerary');
    const removedId = day._id;
    it.days.pull({ _id: removedId });
    await it.save();
    await this.items.removeDayContents(it._id, removedId);
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  /** ITN-08: numbers, dates and city groups are recomputed from the new order. */
  async reorderDays(user: AuthUser, id: string, dto: ReorderDaysDto) {
    const it = await this.items.ownedItinerary(user, id);
    const reordered = reorderDays(
      it.days.map((d) => d.toObject()),
      dto.dayIds,
    );
    it.set('days', reordered);
    await it.save();
    return this.detail(it.toObject(), { includeBudgets: true });
  }

  // ---------- ITN-20 / ITN-21 public ----------

  async searchPublic(q: PublicItinerarySearchDto) {
    if (q.minDays !== undefined && q.maxDays !== undefined && q.minDays > q.maxDays) {
      throw new BadRequestException('minDays cannot exceed maxDays');
    }
    const filter: Record<string, any> = {
      visibility: ItineraryVisibility.Public,
      ownerId: { $nin: await this.usersService.getDeactivatedUserIds() },
    };
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }
    if (q.country) filter.countryCodes = q.country;
    if (q.city) filter['days.cityId'] = (await this.reference.resolveCity(q.city))._id;
    const size: Record<string, unknown>[] = [];
    if (q.minDays !== undefined) size.push({ $gte: [{ $size: '$days' }, q.minDays] });
    if (q.maxDays !== undefined) size.push({ $lte: [{ $size: '$days' }, q.maxDays] });
    if (size.length) filter.$expr = { $and: size };

    const sort: Record<string, 1 | -1> =
      q.sort === PublicItinerarySort.Oldest
        ? { publishedAt: 1, _id: 1 }
        : q.sort === PublicItinerarySort.Title
          ? { title: 1, _id: 1 }
          : { publishedAt: -1, _id: -1 };
    const page = await paginate(this.itineraries, filter, {
      page: q.page,
      limit: q.limit,
      sort,
      populate: { path: 'ownerId', select: 'name status' },
    });
    return {
      ...page,
      items: page.items.map((it: any) => ({
        ...itinerarySummary({ ...it, ownerId: it.ownerId?._id }),
        author: publicAuthor(it.ownerId),
      })),
    };
  }

  /** ITN-21: anyone (guests too) can view a public itinerary; private ones are 404. */
  async getPublic(id: string) {
    const it = await this.itineraries
      .findOne({ _id: id, visibility: ItineraryVisibility.Public })
      .populate({ path: 'ownerId', select: 'name status' })
      .lean()
      .exec();
    const owner: any = it?.ownerId;
    if (!it || !owner || owner.status === 'deactivated') throw new NotFoundException('Itinerary not found');
    const detail = await this.detail({ ...it, ownerId: owner._id }, { includeBudgets: false });
    return { ...detail, author: publicAuthor(owner) };
  }

  /** ITN-21: an independent private copy that keeps attribution to the original author. */
  async clone(user: AuthUser, id: string, dto: CloneItineraryDto) {
    const source = await this.itineraries
      .findOne({ _id: id, visibility: ItineraryVisibility.Public })
      .populate({ path: 'ownerId', select: 'name status' })
      .lean()
      .exec();
    const owner: any = source?.ownerId;
    if (!source || !owner || owner.status === 'deactivated') throw new NotFoundException('Itinerary not found');

    const dayMap = new Map<string, Types.ObjectId>();
    const days = (source.days ?? []).map((d: any) => {
      const newId = new Types.ObjectId();
      dayMap.set(String(d._id), newId);
      return {
        _id: newId,
        cityId: d.cityId,
        cityCode: d.cityCode,
        cityName: d.cityName,
        countryCode: d.countryCode,
        title: d.title,
        notes: d.notes,
      };
    });
    const newOwnerId = new Types.ObjectId(user.id);
    // Attribution credits the itinerary actually cloned (and its author).
    const copy = await this.itineraries.create({
      ownerId: newOwnerId,
      title: dto.title ?? source.title,
      description: source.description,
      countryCodes: source.countryCodes,
      startDate: dto.startDate ? this.futureStart(dto.startDate) : source.startDate,
      visibility: ItineraryVisibility.Private,
      budgetCurrency: source.budgetCurrency,
      days,
      clonedFrom: {
        itineraryId: source._id,
        ownerId: owner._id,
        ownerName: owner.name,
        title: source.title,
        clonedAt: new Date(),
      },
    });
    try {
      await this.items.copyContents(source._id, copy._id, newOwnerId, dayMap);
    } catch (err) {
      // Never leave a half-copied clone behind.
      await this.items.removeAllContents(copy._id);
      await this.itineraries.deleteOne({ _id: copy._id }).exec();
      throw err;
    }
    return this.detail(copy.toObject(), { includeBudgets: true });
  }

  // ---------- ITN-25 / ITN-26: search from the itinerary context ----------

  /** ITN-25: hotels in one of the itinerary's cities, for exactly the nights spent there. */
  async searchHotels(user: AuthUser, id: string, q: ItineraryHotelSearchDto) {
    const it = await this.items.ownedItinerary(user, id);
    const { cityGroups } = derive(it.toObject());
    if (!cityGroups.length) throw new BadRequestException('Add days to the itinerary before searching hotels');
    let group = cityGroups[0];
    if (q.city) {
      const city = await this.reference.resolveCity(q.city);
      const match = cityGroups.find((g) => g.cityId === String(city._id));
      if (!match) {
        throw new BadRequestException({
          message: `${city.name} is not part of this itinerary`,
          errors: [{ field: 'city', messages: ['Pick a city that appears in the itinerary'] }],
        });
      }
      group = match;
    }
    const checkIn = group.startDate;
    const checkOut = isoDay(addDays(parseDateOnly(group.endDate), 1));
    if (checkIn < isoDay(todayUtc())) throw new BadRequestException('This part of the trip is in the past');
    const results = await this.hooks.searchHotels({
      city: group.cityName,
      country: group.countryCode,
      checkIn,
      checkOut,
      guests: q.guests ?? 1,
      rooms: q.rooms ?? 1,
      page: q.page ?? 1,
      limit: q.limit ?? 10,
      sort: q.sort,
    });
    return {
      itineraryId: String(it._id),
      city: { cityId: group.cityId, cityCode: group.cityCode, cityName: group.cityName },
      checkIn,
      checkOut,
      results,
    };
  }

  /**
   * ITN-26: flights for one move between cities (leg N = from city group N to group N+1),
   * departing on the first day in the next city. With `fromCity`, searches the trip's arrival
   * flight instead (home city -> first itinerary city on the start date). Every airport of both
   * cities is searched (reference airportsInCity) and the offers are merged, cheapest first.
   */
  async searchFlights(user: AuthUser, id: string, q: ItineraryFlightSearchDto) {
    const it = await this.items.ownedItinerary(user, id);
    const { cityGroups } = derive(it.toObject());
    if (!cityGroups.length) throw new BadRequestException('Add days to the itinerary before searching flights');

    let fromCityId: string;
    let toGroup = cityGroups[0];
    let leg: number | null = null;
    if (q.fromCity) {
      const from = await this.reference.resolveCity(q.fromCity);
      fromCityId = String(from._id);
      if (fromCityId === toGroup.cityId) throw new BadRequestException('fromCity is already the first itinerary city');
    } else {
      leg = q.leg ?? 1;
      if (cityGroups.length < 2)
        throw new BadRequestException('The itinerary never changes city, so there is no flight leg');
      if (leg > cityGroups.length - 1) {
        throw new BadRequestException({
          message: `This itinerary has ${cityGroups.length - 1} city change(s)`,
          errors: [{ field: 'leg', messages: [`Must be between 1 and ${cityGroups.length - 1}`] }],
        });
      }
      fromCityId = cityGroups[leg - 1].cityId;
      toGroup = cityGroups[leg];
    }
    const departureDate = toGroup.startDate;
    const [fromAirports, toAirports] = await Promise.all([
      this.reference.airportsInCity(fromCityId),
      this.reference.airportsInCity(toGroup.cityId),
    ]);
    const fromCity = await this.reference.resolveCity(fromCityId);
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const context = {
      itineraryId: String(it._id),
      leg,
      from: { cityId: fromCityId, cityName: fromCity.name, airports: fromAirports.map((a) => a.iataCode) },
      to: { cityId: toGroup.cityId, cityName: toGroup.cityName, airports: toAirports.map((a) => a.iataCode) },
      departureDate,
    };
    if (!fromAirports.length || !toAirports.length || departureDate < isoDay(todayUtc())) {
      return { ...context, results: toPage([], 0, page, limit) };
    }

    const offers: any[] = [];
    for (const origin of fromAirports) {
      for (const destination of toAirports) {
        const result = await this.flights.search({
          origin: origin.iataCode,
          destination: destination.iataCode,
          departureDate,
          adults: q.adults ?? 1,
          children: q.children ?? 0,
          infants: q.infants ?? 0,
          page: 1,
          limit: 100,
        } as any);
        offers.push(...result.items);
      }
    }
    offers.sort(
      (a, b) =>
        a.price - b.price || new Date(a.outbound.departureAt).getTime() - new Date(b.outbound.departureAt).getTime(),
    );
    return { ...context, results: toPage(offers.slice((page - 1) * limit, page * limit), offers.length, page, limit) };
  }

  // ---------- helpers ----------

  /** Full itinerary: derived days with their activities, city groups, budgets and transport. */
  private async detail(it: any, opts: { includeBudgets: boolean }) {
    const { days, cityGroups } = derive(it);
    const contents = await this.items.contentsOf(it._id, opts);
    const activitiesByDay = new Map<string, typeof contents.activities>();
    for (const a of contents.activities) {
      const list = activitiesByDay.get(a.dayId) ?? [];
      list.push(a);
      activitiesByDay.set(a.dayId, list);
    }
    const budgetsByDay = new Map<string, typeof contents.budgets>();
    for (const b of contents.budgets) {
      const list = budgetsByDay.get(b.dayId) ?? [];
      list.push(b);
      budgetsByDay.set(b.dayId, list);
    }
    return {
      ...itinerarySummary(it),
      ownerId: String(it.ownerId),
      clonedFrom: cloneInfo(it.clonedFrom),
      days: days.map((d) => ({
        ...d,
        activities: activitiesByDay.get(d.id) ?? [],
        ...(opts.includeBudgets ? { budgets: budgetsByDay.get(d.id) ?? [] } : {}),
      })),
      cityGroups,
      ...(opts.includeBudgets ? { transportCosts: contents.transport } : {}),
    };
  }

  private includeCountry(it: ItineraryDocument, code: string) {
    if (!it.countryCodes.includes(code)) it.countryCodes.push(code);
  }

  /** Start dates must not be in the past (a plan is for an upcoming trip). */
  private futureStart(value: string) {
    const date = parseDateOnly(value);
    if (date < todayUtc()) {
      throw new BadRequestException({
        message: 'startDate cannot be in the past',
        errors: [{ field: 'startDate', messages: ['Must be today or later'] }],
      });
    }
    return date;
  }
}
