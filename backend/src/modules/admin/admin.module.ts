import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController, ContentReportsController } from './admin.controller';
import { AdminService } from './admin.service';
import { FlightsModule } from '../flights/flights.module';
import { BlogModule } from '../blog/blog.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Comment, CommentSchema } from '../blog/schemas/comment.schema';
import { Airline, AirlineSchema } from '../flights/schemas/airline.schema';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { ContentReport, ContentReportSchema } from './schemas/content-report.schema';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';

/**
 * Administration and moderation (Person 6B). Blog schemas are registered here for reports;
 * the blog module continues to own normal post and comment operations.
 */
@Module({
  imports: [
    FlightsModule,
    BlogModule,
    UsersModule,
    NotificationsModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
    ]),
  ],
  controllers: [AdminProvidersController, AdminController, ContentReportsController],
  providers: [AdminProvidersService, AdminService],
})
export class AdminModule {}
