import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { ETicketService } from './e-ticket.service';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FLIGHT_INVENTORY } from './ports/flight-inventory.port';
import { FlightBooking, FlightBookingSchema } from './schemas/flight-booking.schema';
import { StubFlightInventoryService } from './stub/stub-flight-inventory.service';
import { StubFlight, StubFlightSchema } from './stub/stub-flight.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: StubFlight.name, schema: StubFlightSchema }, // remove with the stub
    ]),
    UsersModule,
    PaymentsModule,
  ],
  controllers: [FlightBookingsController],
  providers: [
    FlightBookingsService,
    ETicketService,
    // When Person 2 merges: import FlightsModule and use { provide: FLIGHT_INVENTORY, useExisting: FlightsService }.
    { provide: FLIGHT_INVENTORY, useClass: StubFlightInventoryService },
  ],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}
