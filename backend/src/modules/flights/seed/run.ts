import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import configuration from '../../../config/configuration';
import { ReferenceDataModule } from '../../reference-data/reference-data.module';
import { ReferenceDataService } from '../../reference-data/reference-data.service';
import { Airline, AirlineSchema } from '../schemas/airline.schema';
import { Flight, FlightSchema } from '../schemas/flight.schema';
import { seedFlightSamples } from './flights.seed';

/** Separate Person 2 command: no HTTP server, auth dependencies or scheduled jobs. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => {
      const uri = config.get<string>('mongo.uri');
      if (!uri) throw new Error('MONGODB_URI is required for seed:flights');
      return { uri };
    } }),
    ReferenceDataModule,
    MongooseModule.forFeature([{ name: Airline.name, schema: AirlineSchema }, { name: Flight.name, schema: FlightSchema }]),
  ],
})
class FlightSeedModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(FlightSeedModule);
  try {
    const airlines = app.get(getModelToken(Airline.name));
    const flights = app.get(getModelToken(Flight.name));
    await Promise.all([airlines.init(), flights.init()]);
    const result = await seedFlightSamples(airlines, flights, app.get(ReferenceDataService), app.get(ConfigService).get('platformCurrency'), process.env.SEED_FLIGHT_DATE);
    console.log(result);
  } finally { await app.close(); }
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
