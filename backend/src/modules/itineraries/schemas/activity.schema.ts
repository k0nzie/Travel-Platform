import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * ITN-10: an activity planned on one itinerary day. Separate collection because it has its own
 * endpoints (/api/activities/:id) and its own images (ITN-12, MediaService).
 */
@Schema({ collection: 'itinerary_activities', timestamps: true })
export class Activity {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  /** _id of the embedded day inside the itinerary. */
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  dayId: Types.ObjectId;

  /** Copied from the itinerary so ownership checks need no extra lookup. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  /** "HH:mm", local time at the destination. */
  @Prop()
  startTime?: string;

  @Prop()
  endTime?: string;

  @Prop({ trim: true, maxlength: 200 })
  location?: string;

  /** Optional official attraction (GEN-12). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Attraction' })
  attractionId?: Types.ObjectId;

  @Prop()
  attractionCode?: string;

  @Prop()
  attractionName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}
export type ActivityDocument = HydratedDocument<Activity>;
export const ActivitySchema = SchemaFactory.createForClass(Activity);
ActivitySchema.index({ itineraryId: 1, dayId: 1, startTime: 1, createdAt: 1 });
