import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** ITN-14: the four daily budget categories. Intercity transport is separate (TransportCost, ITN-16). */
export enum BudgetCategory {
  Food = 'food',
  Accommodation = 'accommodation',
  LocalTransport = 'local_transport',
  Activities = 'activities',
}

/** ITN-14: an amount planned for one day, in any supported currency (converted in the summary, ITN-18). */
@Schema({ collection: 'itinerary_budget_entries', timestamps: true })
export class BudgetEntry {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(BudgetCategory), required: true })
  category: BudgetCategory;

  @Prop({ trim: true, maxlength: 200 })
  description?: string;

  /** Integer minor units (PAY-04 convention). */
  @Prop({ required: true, min: 0 })
  amountMinor: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  createdAt?: Date;
  updatedAt?: Date;
}
export type BudgetEntryDocument = HydratedDocument<BudgetEntry>;
export const BudgetEntrySchema = SchemaFactory.createForClass(BudgetEntry);
