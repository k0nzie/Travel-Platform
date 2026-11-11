import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsModule } from '../hotels/hotels.module';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { Room, RoomSchema } from '../hotels/schemas/room.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelReviewsController, PublicHotelReviewsController } from './hotel-reviews.controller';
import { HotelReviewsService } from './hotel-reviews.service';
import { HotelRoomManagementController } from './hotel-room-management.controller';
import { HotelRoomManagementService } from './hotel-room-management.service';
import { HotelStaffBookingsController } from './hotel-staff-bookings.controller';
import { HotelStaffBookingsService } from './hotel-staff-bookings.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { HotelReview, HotelReviewSchema } from './schemas/hotel-review.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: HotelReview.name, schema: HotelReviewSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    HotelsModule,
    PaymentsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [
    HotelBookingsController,
    HotelStaffBookingsController,
    HotelReviewsController,
    PublicHotelReviewsController,
    HotelRoomManagementController,
  ],
  providers: [
    HotelBookingsService,
    HotelStaffBookingsService,
    HotelReviewsService,
    HotelRoomManagementService,
  ],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
