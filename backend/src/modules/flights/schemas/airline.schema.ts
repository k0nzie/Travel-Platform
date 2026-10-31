import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** FLT-01: provider identity. Logo files belong to MediaOwnerType.AirlineLogo. */
@Schema({ timestamps: true, collection: 'airlines' })
export class Airline {
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, unique: true, match: /^[A-Z0-9]{2,3}$/ }) code: string;
  @Prop({ required: true, match: /^[A-Z]{2}$/ }) countryCode: string;
  @Prop({ maxlength: 2000 }) description?: string;
}
export type AirlineDocument = HydratedDocument<Airline>;
export const AirlineSchema = SchemaFactory.createForClass(Airline);
