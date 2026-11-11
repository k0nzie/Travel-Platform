import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** One review per completed hotel reservation, never one per room (HTL-23). */
@Schema({ timestamps: true, collection: 'hotel_reviews' })
export class HotelReview {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'HotelBooking', required: true, unique: true })
  bookingId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5, validate: Number.isInteger })
  rating: number;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  review: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type HotelReviewDocument = HydratedDocument<HotelReview>;
export const HotelReviewSchema = SchemaFactory.createForClass(HotelReview);
HotelReviewSchema.index({ hotelId: 1, createdAt: -1, _id: -1 });
