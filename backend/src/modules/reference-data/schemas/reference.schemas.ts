import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

/**
 * Read-only reference data seeded at setup from the official course datasets (GEN-12, FLT-02).
 * Every record keeps the dataset's own identifier, which is what evaluation and other modules use:
 *   Country.code ("EG"), City.code (city_id, "cairo"), Airport.iataCode ("CAI"),
 *   Attraction.code (attraction_id, "att-1"), Currency.code ("EGP", from Countries.csv).
 * ReferenceDataService accepts either that code or the Mongo _id wherever a record is looked up.
 */

@Schema({ collection: 'countries', versionKey: false })
export class Country {
  /** ISO 3166-1 alpha-2, e.g. "EG" */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true, index: true })
  name: string;
}
export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);

@Schema({ collection: 'cities', versionKey: false })
export class City {
  /** Official city_id, e.g. "cairo". */
  @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
  code?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, uppercase: true, index: true })
  countryCode: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Country', required: true, index: true })
  countryId: Types.ObjectId;

  @Prop()
  timezone?: string;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;
}
export type CityDocument = HydratedDocument<City>;
export const CitySchema = SchemaFactory.createForClass(City);
CitySchema.index({ name: 1, countryCode: 1 }, { unique: true });

@Schema({ collection: 'airports', versionKey: false })
export class Airport {
  /** IATA code, e.g. "CAI" */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  iataCode: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true, index: true })
  cityId: Types.ObjectId;

  @Prop({ required: true })
  cityName: string;

  /** Official city_id of the airport's city, e.g. "cairo". */
  @Prop({ lowercase: true, index: true })
  cityCode?: string;

  @Prop({ required: true, uppercase: true, index: true })
  countryCode: string;

  /** IANA zone, e.g. "Africa/Cairo" (GEN-06). */
  @Prop({ required: true })
  timezone: string;
}
export type AirportDocument = HydratedDocument<Airport>;
export const AirportSchema = SchemaFactory.createForClass(Airport);

@Schema({ collection: 'currencies', versionKey: false })
export class Currency {
  /** ISO 4217, e.g. "EGP" */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  symbol?: string;
}
export type CurrencyDocument = HydratedDocument<Currency>;
export const CurrencySchema = SchemaFactory.createForClass(Currency);

@Schema({ collection: 'attractions', versionKey: false })
export class Attraction {
  /** Official attraction_id, e.g. "att-1". */
  @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
  code?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', index: true })
  cityId?: Types.ObjectId;

  @Prop()
  cityName?: string;

  /** Official city_id, e.g. "cairo". */
  @Prop({ lowercase: true, index: true })
  cityCode?: string;

  @Prop({ uppercase: true, index: true })
  countryCode?: string;

  @Prop()
  category?: string;

  @Prop()
  description?: string;
}
export type AttractionDocument = HydratedDocument<Attraction>;
export const AttractionSchema = SchemaFactory.createForClass(Attraction);
AttractionSchema.index({ name: 1, cityId: 1 }, { unique: true });
