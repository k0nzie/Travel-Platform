import { CityGroup, DerivedDay, deriveDays, groupByCity, isoDay } from './itinerary-days.logic';

/**
 * Explicit response shapes (CONVENTIONS: no spreading whole lean documents).
 * `id` strings are produced here and by the global SerializeIds interceptor.
 */

export interface ItinerarySummary {
  id: string;
  title: string;
  description: string | null;
  countryCodes: string[];
  startDate: string;
  endDate: string | null;
  dayCount: number;
  cities: string[];
  visibility: string;
  budgetCurrency: string | null;
  clonedFrom: CloneInfo | null;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}

export interface CloneInfo {
  itineraryId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  clonedAt: Date;
}

export function cloneInfo(c: any): CloneInfo | null {
  if (!c) return null;
  return {
    itineraryId: String(c.itineraryId),
    ownerId: String(c.ownerId),
    ownerName: c.ownerName,
    title: c.title,
    clonedAt: c.clonedAt,
  };
}

export function derive(it: any): { days: DerivedDay[]; cityGroups: CityGroup[] } {
  const days = deriveDays(it.startDate, it.days ?? []);
  return { days, cityGroups: groupByCity(days) };
}

export function itinerarySummary(it: any): ItinerarySummary {
  const { days, cityGroups } = derive(it);
  return {
    id: String(it._id),
    title: it.title,
    description: it.description ?? null,
    countryCodes: it.countryCodes ?? [],
    startDate: isoDay(it.startDate),
    endDate: days.length ? days[days.length - 1].date : null,
    dayCount: days.length,
    cities: cityGroups.map((g) => g.cityName),
    visibility: it.visibility,
    budgetCurrency: it.budgetCurrency ?? null,
    clonedFrom: cloneInfo(it.clonedFrom),
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  };
}

export interface ImageResponse {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt?: Date;
}

export function activityResponse(a: any, images: ImageResponse[]) {
  return {
    id: String(a._id),
    itineraryId: String(a.itineraryId),
    dayId: String(a.dayId),
    title: a.title as string,
    description: (a.description ?? null) as string | null,
    startTime: (a.startTime ?? null) as string | null,
    endTime: (a.endTime ?? null) as string | null,
    location: (a.location ?? null) as string | null,
    attraction: a.attractionId
      ? {
          id: String(a.attractionId),
          code: (a.attractionCode ?? null) as string | null,
          name: a.attractionName as string,
        }
      : null,
    images,
    createdAt: a.createdAt as Date | undefined,
    updatedAt: a.updatedAt as Date | undefined,
  };
}
export type ActivityResponse = ReturnType<typeof activityResponse>;

export function budgetEntryResponse(b: any) {
  return {
    id: String(b._id),
    itineraryId: String(b.itineraryId),
    dayId: String(b.dayId),
    category: b.category as string,
    description: (b.description ?? null) as string | null,
    amountMinor: b.amountMinor as number,
    currency: b.currency as string,
    createdAt: b.createdAt as Date | undefined,
    updatedAt: b.updatedAt as Date | undefined,
  };
}
export type BudgetEntryResponse = ReturnType<typeof budgetEntryResponse>;

export function transportCostResponse(t: any) {
  return {
    id: String(t._id),
    itineraryId: String(t.itineraryId),
    from: { cityId: String(t.fromCityId), cityCode: t.fromCityCode as string, cityName: t.fromCityName as string },
    to: { cityId: String(t.toCityId), cityCode: t.toCityCode as string, cityName: t.toCityName as string },
    mode: t.mode as string,
    travelDate: t.travelDate ? isoDay(t.travelDate) : null,
    description: (t.description ?? null) as string | null,
    amountMinor: t.amountMinor as number,
    currency: t.currency as string,
    createdAt: t.createdAt as Date | undefined,
    updatedAt: t.updatedAt as Date | undefined,
  };
}
export type TransportCostResponse = ReturnType<typeof transportCostResponse>;
