import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirlinesController, FlightsController } from './flights.controller';
import { FlightHooksService } from './flight-hooks.service';
import { FlightsService } from './flights.service';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import { Flight, FlightSchema } from './schemas/flight.schema';
import { FlightBookingView, FlightBookingViewSchema } from './schemas/flight-booking-view.schema';

/** Person 3 imports this module for atomic inventory operations on FlightsService. */
@Module({
  imports: [MongooseModule.forFeature([
    { name: Airline.name, schema: AirlineSchema },
    { name: Flight.name, schema: FlightSchema },
    { name: FlightBookingView.name, schema: FlightBookingViewSchema },
  ])],
  controllers: [AirlinesController, FlightsController],
  providers: [FlightsService, FlightHooksService],
  exports: [FlightsService, FlightHooksService],
})
export class FlightsModule {}
