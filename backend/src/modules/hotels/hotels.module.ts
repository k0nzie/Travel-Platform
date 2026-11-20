import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { RoomsService } from './rooms.service';

import { Hotel, HotelSchema } from './schemas/hotel.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { HotelSearchService } from './hotel-search.service';
import { HotelInventoryService } from './hotel-inventory.service';
import { HotelSearchQueryDto, HotelSearchSort } from './dto/hotel-search.dto';
import { ItinerariesModule } from '../itineraries/itineraries.module';
import { ItineraryHooksService } from '../itineraries/itinerary-hooks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Hotel.name,
        schema: HotelSchema,
      },
      {
        name: Room.name,
        schema: RoomSchema,
      },
    ]),
    ItinerariesModule,
  ],
  controllers: [HotelsController],
  providers: [HotelsService, RoomsService, HotelSearchService, HotelInventoryService],
  exports: [HotelsService, RoomsService, HotelSearchService, HotelInventoryService],
})
export class HotelsModule implements OnModuleInit {
  constructor(
    private readonly itineraryHooks: ItineraryHooksService,
    private readonly search: HotelSearchService,
  ) {}

  /** ITN-25: itineraries search hotels through the normal hotel search (no direct import the other way). */
  onModuleInit() {
    this.itineraryHooks.registerHotelSearch((q) =>
      this.search.searchHotels({
        city: q.city,
        country: q.country,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        guests: q.guests,
        rooms: q.rooms,
        page: q.page,
        limit: q.limit,
        sort: (q.sort as HotelSearchSort) ?? HotelSearchSort.PriceAsc,
      } as HotelSearchQueryDto),
    );
  }
}
