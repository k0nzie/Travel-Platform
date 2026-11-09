import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { RoomsService } from './rooms.service';

import { Hotel, HotelSchema } from './schemas/hotel.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { HotelSearchService } from './hotel-search.service';
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
  ],
  controllers: [HotelsController],
  providers: [HotelsService, RoomsService, HotelSearchService],
  exports: [HotelsService, RoomsService, HotelSearchService],
})
export class HotelsModule {}
