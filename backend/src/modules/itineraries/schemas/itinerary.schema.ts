import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum ItineraryVisibility {
  Private = 'private',
  Public = 'public',
}

/**
 * ITN-05: one day of the trip. Days are embedded because they only exist inside their itinerary
 * and are always read together with it. Their order in the array IS the day order, so the
 * day number and the date are derived (ITN-08): dayNumber = index + 1, date = startDate + index.
 */
@Schema({ _id: true })
export class ItineraryDay {
  _id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
  cityId: Types.ObjectId;

  /** Official city_id, e.g. "cairo" (GEN-12). */
  @Prop({ required: true, lowercase: true })
  cityCode: string;

  @Prop({ required: true })
  cityName: string;

  @Prop({ required: true, uppercase: true })
  countryCode: string;

  @Prop({ trim: true, maxlength: 100 })
  title?: string;

  @Prop({ trim: true, maxlength: 2000 })
  notes?: string;
}
export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

/** ITN-21: who the itinerary was cloned from (attribution survives even if the original is deleted). */
@Schema({ _id: false })
export class CloneAttribution {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', required: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true })
  ownerName: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  clonedAt: Date;
}
export const CloneAttributionSchema = SchemaFactory.createForClass(CloneAttribution);

@Schema({ collection: 'itineraries', timestamps: true })
export class Itinerary {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  /** ISO country codes from the official list (ITN-01). */
  @Prop({ type: [String], required: true, index: true })
  countryCodes: string[];

  /** Date-only, stored as UTC midnight. Day dates are derived from it (ITN-08). */
  @Prop({ required: true })
  startDate: Date;

  @Prop({ type: String, enum: Object.values(ItineraryVisibility), default: ItineraryVisibility.Private, index: true })
  visibility: ItineraryVisibility;

  @Prop({ type: [ItineraryDaySchema], default: [] })
  days: Types.DocumentArray<ItineraryDay & { _id: Types.ObjectId }>;

  /** Currency used for the budget summary when the user does not pick one (ITN-18). */
  @Prop({ uppercase: true })
  budgetCurrency?: string;

  @Prop({ type: CloneAttributionSchema })
  clonedFrom?: CloneAttribution;

  /** Set when the owner makes it public; used to sort public search results. */
  @Prop()
  publishedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export type ItineraryDocument = HydratedDocument<Itinerary>;
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ ownerId: 1, updatedAt: -1 });
ItinerarySchema.index({ visibility: 1, publishedAt: -1 });
ItinerarySchema.index({ visibility: 1, 'days.cityCode': 1 });
