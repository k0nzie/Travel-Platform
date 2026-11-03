import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirlinesController, FlightsController } from './flights.controller';
import { FlightHooksService } from './flight-hooks.service';
import { FlightsService } from './flights.service';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import { Flight, FlightSchema } from './schemas/flight.schema';

/**
 * Catalog, search and seat inventory. FlightBookingsModule imports this module,
 * uses FlightsService for atomic inventory, and registers its FlightBookingsBridge
 * with FlightHooksService for cancellations, schedule changes and FLT-29.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Flight.name, schema: FlightSchema },
    ]),
  ],
  controllers: [AirlinesController, FlightsController],
  providers: [FlightsService, FlightHooksService],
  exports: [FlightsService, FlightHooksService],
})
export class FlightsModule {}
