import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertOwner } from '../../common/utils/access.util';
import { parseDateOnly } from '../../common/utils/time.util';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MediaService } from '../media/media.service';
import { MediaOwnerType } from '../media/schemas/media.schema';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateActivityDto,
  CreateBudgetEntryDto,
  CreateTransportCostDto,
  UpdateActivityDto,
  UpdateBudgetEntryDto,
  UpdateTransportCostDto,
} from './dto/items.dto';
import { minutesOf } from './itinerary-days.logic';
import {
  ActivityResponse,
  activityResponse,
  budgetEntryResponse,
  derive,
  transportCostResponse,
} from './itinerary-response';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import { BudgetCategory, BudgetEntry, BudgetEntryDocument } from './schemas/budget-entry.schema';
import { Itinerary, ItineraryDocument, ItineraryVisibility } from './schemas/itinerary.schema';
import { TransportCost, TransportCostDocument } from './schemas/transport-cost.schema';

/**
 * Everything that hangs off an itinerary: activities + images (ITN-10, ITN-12),
 * budget entries (ITN-14), intercity transport (ITN-16) and the converted budget summary (ITN-18).
 * Every write checks ownership of the parent itinerary here, in the service (ACC-11).
 */
@Injectable()
export class ItineraryItemsService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(Activity.name) private readonly activities: Model<ActivityDocument>,
    @InjectModel(BudgetEntry.name) private readonly budgets: Model<BudgetEntryDocument>,
    @InjectModel(TransportCost.name) private readonly transport: Model<TransportCostDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly media: MediaService,
    private readonly reference: ReferenceDataService,
    private readonly fx: ExchangeRatesService,
  ) {}

  // ---------- shared loaders ----------

  /** The itinerary if `user` owns it; 404 otherwise (strangers cannot tell it exists). */
  async ownedItinerary(user: AuthUser, id: string | Types.ObjectId) {
    const it = Types.ObjectId.isValid(String(id)) ? await this.itineraries.findById(id).exec() : null;
    if (!it) throw new NotFoundException('Itinerary not found');
    assertOwner(it.ownerId, user, { resource: 'Itinerary' });
    return it;
  }

  private findDay(it: ItineraryDocument, dayId: string) {
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found in this itinerary');
    return day;
  }

  /** Bumps the itinerary's updatedAt so "my itineraries" sorts by latest change. */
  private touch(itineraryId: Types.ObjectId) {
    return this.itineraries.updateOne({ _id: itineraryId }, { $set: { updatedAt: new Date() } }).exec();
  }

  // ---------- activities (ITN-10) ----------

  async addActivity(user: AuthUser, itineraryId: string, dayId: string, dto: CreateActivityDto) {
    const it = await this.ownedItinerary(user, itineraryId);
    const day = this.findDay(it, dayId);
    this.assertTimes(dto.startTime, dto.endTime);
    const attraction = dto.attractionId ? await this.attractionFor(dto.attractionId, day.cityId) : null;
    const doc = await this.activities.create({
      itineraryId: it._id,
      dayId: day._id,
      ownerId: it.ownerId,
      title: dto.title,
      description: dto.description,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location,
      ...(attraction ?? {}),
    });
    await this.touch(it._id);
    return activityResponse(doc.toObject(), []);
  }

  async updateActivity(user: AuthUser, id: string, dto: UpdateActivityDto) {
    const activity = await this.ownedActivity(user, id);
    const startTime = dto.startTime !== undefined ? dto.startTime : activity.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : activity.endTime;
    this.assertTimes(startTime, endTime);

    const set: Record<string, unknown> = {};
    for (const key of ['title', 'description', 'startTime', 'endTime', 'location'] as const) {
      if (dto[key] !== undefined) set[key] = dto[key];
    }
    if (dto.attractionId !== undefined) {
      if (dto.attractionId === '') {
        Object.assign(set, { attractionId: null, attractionCode: null, attractionName: null });
      } else {
        const it = await this.itineraries.findById(activity.itineraryId).exec();
        const day = it?.days.id(activity.dayId);
        if (!day) throw new NotFoundException('Day not found');
        Object.assign(set, await this.attractionFor(dto.attractionId, day.cityId));
      }
    }
    const updated = await this.activities.findByIdAndUpdate(activity._id, { $set: set }, { new: true }).lean().exec();
    await this.touch(activity.itineraryId);
    return activityResponse(updated, await this.media.list(MediaOwnerType.Activity, activity._id));
  }

  async deleteActivity(user: AuthUser, id: string) {
    const activity = await this.ownedActivity(user, id);
    await this.media.removeAllFor(MediaOwnerType.Activity, activity._id);
    await this.activities.deleteOne({ _id: activity._id }).exec();
    await this.touch(activity.itineraryId);
    return { deleted: true };
  }

  // ---------- activity images (ITN-12, GEN-08) ----------

  async addImages(user: AuthUser, id: string, files: Express.Multer.File[]) {
    const activity = await this.ownedActivity(user, id);
    const saved = await this.media.saveImages({
      files,
      ownerType: MediaOwnerType.Activity,
      ownerId: activity._id,
      uploadedBy: user.id,
    });
    await this.touch(activity.itineraryId);
    return saved;
  }

  async removeImage(user: AuthUser, id: string, imageId: string) {
    const activity = await this.ownedActivity(user, id);
    const result = await this.media.remove(MediaOwnerType.Activity, activity._id, imageId);
    await this.touch(activity.itineraryId);
    return result;
  }

  private async ownedActivity(user: AuthUser, id: string) {
    const activity = await this.activities.findById(id).exec();
    if (!activity) throw new NotFoundException('Activity not found');
    assertOwner(activity.ownerId, user, { resource: 'Activity' });
    return activity;
  }

  private assertTimes(start?: string | null, end?: string | null) {
    if (start && end && minutesOf(end) <= minutesOf(start)) {
      throw new BadRequestException({
        message: 'endTime must be after startTime',
        errors: [{ field: 'endTime', messages: ['Must be after startTime'] }],
      });
    }
  }

  /** The attraction must exist in the official list and be in the day's city. */
  private async attractionFor(attractionId: string, dayCityId: Types.ObjectId) {
    const attraction = await this.reference.resolveAttraction(attractionId);
    if (attraction.cityId && String(attraction.cityId) !== String(dayCityId)) {
      throw new BadRequestException({
        message: `"${attraction.name}" is not in this day's city`,
        errors: [{ field: 'attractionId', messages: ["Attraction must be in the day's city"] }],
      });
    }
    return { attractionId: attraction._id, attractionCode: attraction.code, attractionName: attraction.name };
  }

  // ---------- budget entries (ITN-14) ----------

  async addBudget(user: AuthUser, itineraryId: string, dayId: string, dto: CreateBudgetEntryDto) {
    const it = await this.ownedItinerary(user, itineraryId);
    const day = this.findDay(it, dayId);
    const currency = await this.reference.assertSupportedCurrency(dto.currency);
    const doc = await this.budgets.create({
      itineraryId: it._id,
      dayId: day._id,
      ownerId: it.ownerId,
      category: dto.category,
      description: dto.description,
      amountMinor: dto.amountMinor,
      currency,
    });
    await this.touch(it._id);
    return budgetEntryResponse(doc.toObject());
  }

  async updateBudget(user: AuthUser, id: string, dto: UpdateBudgetEntryDto) {
    const entry = await this.budgets.findById(id).exec();
    if (!entry) throw new NotFoundException('Budget entry not found');
    assertOwner(entry.ownerId, user, { resource: 'Budget entry' });
    const set: Record<string, unknown> = {};
    for (const key of ['category', 'description', 'amountMinor'] as const) {
      if (dto[key] !== undefined) set[key] = dto[key];
    }
    if (dto.currency !== undefined) set.currency = await this.reference.assertSupportedCurrency(dto.currency);
    const updated = await this.budgets.findByIdAndUpdate(entry._id, { $set: set }, { new: true }).lean().exec();
    await this.touch(entry.itineraryId);
    return budgetEntryResponse(updated);
  }

  async deleteBudget(user: AuthUser, id: string) {
    const entry = await this.budgets.findById(id).exec();
    if (!entry) throw new NotFoundException('Budget entry not found');
    assertOwner(entry.ownerId, user, { resource: 'Budget entry' });
    await this.budgets.deleteOne({ _id: entry._id }).exec();
    await this.touch(entry.itineraryId);
    return { deleted: true };
  }

  // ---------- intercity transport (ITN-16) ----------

  async addTransport(user: AuthUser, itineraryId: string, dto: CreateTransportCostDto) {
    const it = await this.ownedItinerary(user, itineraryId);
    const fields = await this.transportFields(dto);
    const doc = await this.transport.create({ itineraryId: it._id, ownerId: it.ownerId, ...fields });
    await this.touch(it._id);
    return transportCostResponse(doc.toObject());
  }

  async updateTransport(user: AuthUser, id: string, dto: UpdateTransportCostDto) {
    const cost = await this.transport.findById(id).exec();
    if (!cost) throw new NotFoundException('Transport cost not found');
    assertOwner(cost.ownerId, user, { resource: 'Transport cost' });
    const merged = {
      fromCityId: dto.fromCityId ?? String(cost.fromCityId),
      toCityId: dto.toCityId ?? String(cost.toCityId),
    };
    const set: Record<string, unknown> = await this.transportFields({ ...dto, ...merged }, true);
    const updated = await this.transport.findByIdAndUpdate(cost._id, { $set: set }, { new: true }).lean().exec();
    await this.touch(cost.itineraryId);
    return transportCostResponse(updated);
  }

  async deleteTransport(user: AuthUser, id: string) {
    const cost = await this.transport.findById(id).exec();
    if (!cost) throw new NotFoundException('Transport cost not found');
    assertOwner(cost.ownerId, user, { resource: 'Transport cost' });
    await this.transport.deleteOne({ _id: cost._id }).exec();
    await this.touch(cost.itineraryId);
    return { deleted: true };
  }

  private async transportFields(dto: Partial<CreateTransportCostDto>, partial = false) {
    const out: Record<string, unknown> = {};
    const [from, to] = await Promise.all([
      this.reference.resolveCity(dto.fromCityId!),
      this.reference.resolveCity(dto.toCityId!),
    ]);
    if (String(from._id) === String(to._id)) {
      throw new BadRequestException({
        message: 'Intercity transport needs two different cities',
        errors: [{ field: 'toCityId', messages: ['Must differ from fromCityId'] }],
      });
    }
    Object.assign(out, {
      fromCityId: from._id,
      fromCityCode: from.code,
      fromCityName: from.name,
      toCityId: to._id,
      toCityCode: to.code,
      toCityName: to.name,
    });
    if (!partial || dto.mode !== undefined) out.mode = dto.mode;
    if (!partial || dto.amountMinor !== undefined) out.amountMinor = dto.amountMinor;
    if (!partial || dto.description !== undefined) out.description = dto.description;
    if (!partial || dto.currency !== undefined)
      out.currency = await this.reference.assertSupportedCurrency(dto.currency!);
    if (dto.travelDate !== undefined) out.travelDate = parseDateOnly(dto.travelDate);
    return out;
  }

  // ---------- budget summary (ITN-14, ITN-18) ----------

  /**
   * Totals per category, per day and for intercity transport, all converted into one display
   * currency (query param -> itinerary's budgetCurrency -> user's preferredCurrency -> USD).
   * Owners can always read it; anyone can read it for a public itinerary.
   */
  async budgetSummary(user: AuthUser | undefined, itineraryId: string, currency?: string) {
    const it = Types.ObjectId.isValid(itineraryId) ? await this.itineraries.findById(itineraryId).lean().exec() : null;
    if (!it) throw new NotFoundException('Itinerary not found');
    if (it.visibility !== ItineraryVisibility.Public) assertOwner(it.ownerId, user, { resource: 'Itinerary' });

    let display = currency ?? it.budgetCurrency;
    if (!display && user) {
      const me = await this.users.findById(user.id, { preferredCurrency: 1 }).lean().exec();
      display = me?.preferredCurrency;
    }
    display = display ?? 'USD';

    const [entries, costs] = await Promise.all([
      this.budgets.find({ itineraryId: it._id }).lean().exec(),
      this.transport.find({ itineraryId: it._id }).lean().exec(),
    ]);
    const conv = await this.fx.converter(display, [...entries.map((e) => e.currency), ...costs.map((c) => c.currency)]);

    const byCategory: Record<string, number> = Object.fromEntries(Object.values(BudgetCategory).map((c) => [c, 0]));
    const { days } = derive(it);
    const byDay = new Map(days.map((d) => [d.id, { ...d, totalMinor: 0, byCategory: { ...byCategory } }]));

    for (const e of entries) {
      const amount = conv.toDisplay(e.amountMinor, e.currency);
      byCategory[e.category] += amount;
      const day = byDay.get(String(e.dayId));
      if (day) {
        day.totalMinor += amount;
        day.byCategory[e.category] += amount;
      }
    }
    let transportMinor = 0;
    const transportItems = costs.map((c) => {
      const amount = conv.toDisplay(c.amountMinor, c.currency);
      transportMinor += amount;
      return { ...transportCostResponse(c), convertedMinor: amount };
    });
    const dailyMinor = Object.values(byCategory).reduce((a, b) => a + b, 0);

    return {
      itineraryId: String(it._id),
      currency: conv.displayCurrency,
      ratesAt: conv.ratesAt,
      ratesStale: conv.stale,
      byCategoryMinor: byCategory,
      dailyBudgetMinor: dailyMinor,
      transportMinor,
      totalMinor: dailyMinor + transportMinor,
      days: [...byDay.values()].map((d) => ({
        dayId: d.id,
        dayNumber: d.dayNumber,
        date: d.date,
        cityName: d.cityName,
        totalMinor: d.totalMinor,
        byCategoryMinor: d.byCategory,
      })),
      transport: transportItems,
    };
  }

  // ---------- used by ItinerariesService ----------

  /** Activities (with images), budget entries and transport costs of one itinerary, for the detail view. */
  async contentsOf(itineraryId: Types.ObjectId, opts: { includeBudgets: boolean }) {
    const acts = await this.activities.find({ itineraryId }).lean().exec();
    const withImages: ActivityResponse[] = await Promise.all(
      acts.map(async (a) => activityResponse(a, await this.media.list(MediaOwnerType.Activity, a._id))),
    );
    withImages.sort(
      (a, b) =>
        (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') ||
        String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    if (!opts.includeBudgets) return { activities: withImages, budgets: [], transport: [] };
    const [entries, costs] = await Promise.all([
      this.budgets.find({ itineraryId }).sort({ createdAt: 1 }).lean().exec(),
      this.transport.find({ itineraryId }).sort({ createdAt: 1 }).lean().exec(),
    ]);
    return {
      activities: withImages,
      budgets: entries.map(budgetEntryResponse),
      transport: costs.map(transportCostResponse),
    };
  }

  /** ITN-07: a deleted day takes its activities (and their images) and budget entries with it. */
  async removeDayContents(itineraryId: Types.ObjectId, dayId: Types.ObjectId) {
    const acts = await this.activities.find({ itineraryId, dayId }, { _id: 1 }).lean().exec();
    await Promise.all(acts.map((a) => this.media.removeAllFor(MediaOwnerType.Activity, a._id)));
    await Promise.all([
      this.activities.deleteMany({ itineraryId, dayId }).exec(),
      this.budgets.deleteMany({ itineraryId, dayId }).exec(),
    ]);
  }

  /** ITN-01 delete: removes everything that belongs to the itinerary. */
  async removeAllContents(itineraryId: Types.ObjectId) {
    const acts = await this.activities.find({ itineraryId }, { _id: 1 }).lean().exec();
    await Promise.all(acts.map((a) => this.media.removeAllFor(MediaOwnerType.Activity, a._id)));
    await Promise.all([
      this.activities.deleteMany({ itineraryId }).exec(),
      this.budgets.deleteMany({ itineraryId }).exec(),
      this.transport.deleteMany({ itineraryId }).exec(),
    ]);
  }

  /**
   * ITN-21 clone: copies activities (with new image files), budget entries and transport costs
   * onto the new itinerary, mapping old day ids to the clone's new day ids.
   */
  async copyContents(
    fromId: Types.ObjectId,
    toId: Types.ObjectId,
    newOwnerId: Types.ObjectId,
    dayMap: Map<string, Types.ObjectId>,
  ) {
    const [acts, entries, costs] = await Promise.all([
      this.activities.find({ itineraryId: fromId }).lean().exec(),
      this.budgets.find({ itineraryId: fromId }).lean().exec(),
      this.transport.find({ itineraryId: fromId }).lean().exec(),
    ]);
    for (const a of acts) {
      const dayId = dayMap.get(String(a.dayId));
      if (!dayId) continue;
      const copy = await this.activities.create({
        itineraryId: toId,
        dayId,
        ownerId: newOwnerId,
        title: a.title,
        description: a.description,
        startTime: a.startTime,
        endTime: a.endTime,
        location: a.location,
        attractionId: a.attractionId,
        attractionCode: a.attractionCode,
        attractionName: a.attractionName,
      });
      await this.media.copyAll(MediaOwnerType.Activity, a._id, copy._id, String(newOwnerId));
    }
    const budgetCopies = entries
      .filter((e) => dayMap.has(String(e.dayId)))
      .map((e) => ({
        itineraryId: toId,
        dayId: dayMap.get(String(e.dayId)),
        ownerId: newOwnerId,
        category: e.category,
        description: e.description,
        amountMinor: e.amountMinor,
        currency: e.currency,
      }));
    if (budgetCopies.length) await this.budgets.insertMany(budgetCopies);
    const transportCopies = costs.map((c) => ({
      itineraryId: toId,
      ownerId: newOwnerId,
      fromCityId: c.fromCityId,
      fromCityCode: c.fromCityCode,
      fromCityName: c.fromCityName,
      toCityId: c.toCityId,
      toCityCode: c.toCityCode,
      toCityName: c.toCityName,
      mode: c.mode,
      travelDate: c.travelDate,
      description: c.description,
      amountMinor: c.amountMinor,
      currency: c.currency,
    }));
    if (transportCopies.length) await this.transport.insertMany(transportCopies);
  }
}
