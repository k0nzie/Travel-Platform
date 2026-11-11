import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** What ITN-25 asks the Hotels module for. Mirrors HotelSearchQueryDto (Person 4). */
export interface ItineraryHotelQuery {
  city: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
  page: number;
  limit: number;
  sort?: string;
}

export type ItineraryHotelSearchHandler = (q: ItineraryHotelQuery) => Promise<unknown>;

/**
 * ITN-25: Itineraries must reuse the hotel search, but must not import HotelsModule directly
 * (see "Cross-module hooks" in docs/CONVENTIONS.md). HotelsModule registers its search here:
 *
 *   // hotels.module.ts
 *   constructor(private readonly itineraryHooks: ItineraryHooksService, private readonly search: HotelSearchService) {}
 *   onModuleInit() { this.itineraryHooks.registerHotelSearch((q) => this.search.searchHotels(q as any)); }
 */
@Injectable()
export class ItineraryHooksService {
  private hotelSearch?: ItineraryHotelSearchHandler;

  registerHotelSearch(handler: ItineraryHotelSearchHandler) {
    this.hotelSearch = handler;
  }

  /** Fails loudly when Hotels has not registered (convention: never silently skip work). */
  searchHotels(q: ItineraryHotelQuery) {
    if (!this.hotelSearch) {
      throw new HttpException(
        { message: 'Hotel search is not available yet', code: 'HOTEL_SEARCH_UNAVAILABLE' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.hotelSearch(q);
  }
}
