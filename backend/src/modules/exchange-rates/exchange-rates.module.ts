import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRate, ExchangeRateSchema } from './schemas/exchange-rate.schema';

/** ITN-18: FXRatesAPI + daily DB cache + fallback. Itineraries import this for budget conversion. */
@Module({
  imports: [MongooseModule.forFeature([{ name: ExchangeRate.name, schema: ExchangeRateSchema }])],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
