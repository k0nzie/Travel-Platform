import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { validateTiers } from '../../../common/utils/cancellation-tiers';

export enum HotelStatus {
  Active = 'active',
  Inactive = 'inactive',
}

@Schema({ _id: false })
export class HotelCancellationTier {
  @Prop({
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
  })
  minDays: number;

  @Prop({
    required: true,
    min: 0,
    max: 100,
  })
  refundPercent: number;
}

export const HotelCancellationTierSchema = SchemaFactory.createForClass(HotelCancellationTier);

@Schema({ timestamps: true, collection: 'hotels' })
export class Hotel {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  address: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'City',
    required: true,
    index: true,
  })
  cityId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  cityName: string;

  @Prop({
    required: true,
    uppercase: true,
    match: /^[A-Z]{2}$/,
    index: true,
  })
  countryCode: string;

  @Prop({ trim: true, maxlength: 5000 })
  description?: string;

  @Prop({
    required: true,
    min: 1,
    max: 5,
    validate: Number.isInteger,
  })
  starClass: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({
    type: String,
    enum: Object.values(HotelStatus),
    default: HotelStatus.Active,
    index: true,
  })
  status: HotelStatus;

  @Prop({
    default: '14:00',
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  checkInTime: string;

  @Prop({
    default: '12:00',
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  checkOutTime: string;

  @Prop({
    type: [HotelCancellationTierSchema],
    default: [],
    validate: {
      validator: (tiers: HotelCancellationTier[]) => {
        try {
          validateTiers(tiers);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid cancellation tiers',
    },
  })
  cancellationTiers: HotelCancellationTier[];

  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({
    default: 0,
    min: 0,
    validate: Number.isSafeInteger,
  })
  ratingsCount: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export type HotelDocument = HydratedDocument<Hotel>;
export const HotelSchema = SchemaFactory.createForClass(Hotel);

HotelSchema.index({
  status: 1,
  countryCode: 1,
  cityId: 1,
});
