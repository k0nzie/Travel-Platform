import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { FlightsModule } from '../flights/flights.module';
import { UsersModule } from '../users/users.module';
import { ActivitiesController, BudgetsController, ItinerariesController } from './itineraries.controller';
import { ItinerariesService } from './itineraries.service';
import { ItineraryHooksService } from './itinerary-hooks.service';
import { ItineraryItemsService } from './itinerary-items.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { BudgetEntry, BudgetEntrySchema } from './schemas/budget-entry.schema';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema';
import { TransportCost, TransportCostSchema } from './schemas/transport-cost.schema';

/**
 * Person 5: itineraries, days, activities + images, budgets, transport, public search, clone,
 * and hotel/flight search from the itinerary (ITN-01 ... ITN-26).
 * MediaModule and ReferenceDataModule are global. HotelsModule registers with ItineraryHooksService (ITN-25).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: BudgetEntry.name, schema: BudgetEntrySchema },
      { name: TransportCost.name, schema: TransportCostSchema },
    ]),
    UsersModule,
    FlightsModule,
    ExchangeRatesModule,
  ],
  controllers: [ItinerariesController, ActivitiesController, BudgetsController],
  providers: [ItinerariesService, ItineraryItemsService, ItineraryHooksService],
  exports: [ItineraryHooksService],
})
export class ItinerariesModule {}
