import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

/**
 * ITN-18: one snapshot of FXRatesAPI rates per base currency and day (the daily DB cache).
 * `rates[X]` = how many X one unit of `base` buys.
 */
@Schema({ collection: 'exchange_rates', timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, uppercase: true })
  base: string;

  /** "YYYY-MM-DD" (UTC day the snapshot was fetched). */
  @Prop({ required: true })
  day: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  rates: Record<string, number>;

  /** The time FXRatesAPI reported for these rates (falls back to the fetch time). */
  @Prop({ required: true })
  ratesAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export type ExchangeRateDocument = HydratedDocument<ExchangeRate>;
export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ base: 1, day: 1 }, { unique: true });
ExchangeRateSchema.index({ base: 1, ratesAt: -1 });
