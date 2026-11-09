import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsModule } from '../hotels/hotels.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: HotelBooking.name, schema: HotelBookingSchema }]),
    HotelsModule,
    PaymentsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [HotelBookingsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
