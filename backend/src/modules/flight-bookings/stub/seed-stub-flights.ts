import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from '../../../config/configuration';
import { validateEnv } from '../../../config/env.validation';
import { StubFlightInventoryService } from './stub-flight-inventory.service';
import { StubFlight, StubFlightSchema } from './stub-flight.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv, cache: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongo.uri') }),
    }),
    MongooseModule.forFeature([{ name: StubFlight.name, schema: StubFlightSchema }]),
  ],
  providers: [StubFlightInventoryService],
})
class SeedStubFlightsModule {}

/** Prints the flight ids to paste into POST /api/flight-bookings. */
async function main() {
  const app = await NestFactory.createApplicationContext(SeedStubFlightsModule, { logger: ['warn', 'error'] });
  try {
    const flights = await app.get(StubFlightInventoryService).seedSample();
    for (const f of flights) {
      console.log(`${f.flightNumber}  ${f.origin.iataCode} -> ${f.destination.iataCode}  ${f._id}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  new Logger('SeedStubFlights').error(err?.message ?? err, err?.stack);
  process.exit(1);
});
