import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightsModule } from '../flights/flights.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { FlightsInventoryAdapter } from './adapters/flights-inventory.adapter';
import { ETicketService } from './e-ticket.service';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FLIGHT_INVENTORY } from './ports/flight-inventory.port';
import { FlightBooking, FlightBookingSchema } from './schemas/flight-booking.schema';

/**
 * Owns the flight_bookings collection. Depends on FlightsModule for inventory
 * (through FLIGHT_INVENTORY) and registers itself back with FlightHooksService,
 * so flights never touches booking documents.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: FlightBooking.name, schema: FlightBookingSchema }]),
    FlightsModule,
    UsersModule,
    PaymentsModule,
  ],
  controllers: [FlightBookingsController],
  providers: [
    FlightBookingsService,
    ETicketService,
    { provide: FLIGHT_INVENTORY, useClass: FlightsInventoryAdapter },
  ],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}
