import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferenceDataController } from './reference-data.controller';
import { ReferenceDataService } from './reference-data.service';
import {
  Airport,
  AirportSchema,
  Attraction,
  AttractionSchema,
  City,
  CitySchema,
  Country,
  CountrySchema,
  Currency,
  CurrencySchema,
} from './schemas/reference.schemas';

export const REFERENCE_MODELS = MongooseModule.forFeature([
  { name: Country.name, schema: CountrySchema },
  { name: City.name, schema: CitySchema },
  { name: Airport.name, schema: AirportSchema },
  { name: Currency.name, schema: CurrencySchema },
  { name: Attraction.name, schema: AttractionSchema },
]);

/** Global: flights, hotels and itineraries all validate against this data. */
@Global()
@Module({
  imports: [REFERENCE_MODELS],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService],
  exports: [ReferenceDataService, REFERENCE_MODELS],
})
export class ReferenceDataModule {}
