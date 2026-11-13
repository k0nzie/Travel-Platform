import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum TransportMode {
  Flight = 'flight',
  Train = 'train',
  Bus = 'bus',
  Car = 'car',
  Ferry = 'ferry',
  Other = 'other',
}

/** ITN-16: intercity transportation cost, kept separate from the daily budget entries. */
@Schema({ collection: 'itinerary_transport_costs', timestamps: true })
export class TransportCost {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
  fromCityId: Types.ObjectId;

  @Prop({ required: true })
  fromCityCode: string;

  @Prop({ required: true })
  fromCityName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
  toCityId: Types.ObjectId;

  @Prop({ required: true })
  toCityCode: string;

  @Prop({ required: true })
  toCityName: string;

  @Prop({ type: String, enum: Object.values(TransportMode), required: true })
  mode: TransportMode;

  /** Optional travel date (date-only). */
  @Prop()
  travelDate?: Date;

  @Prop({ trim: true, maxlength: 200 })
  description?: string;

  @Prop({ required: true, min: 0 })
  amountMinor: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  createdAt?: Date;
  updatedAt?: Date;
}
export type TransportCostDocument = HydratedDocument<TransportCost>;
export const TransportCostSchema = SchemaFactory.createForClass(TransportCost);
