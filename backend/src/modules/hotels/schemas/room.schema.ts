import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum RoomStatus {
  Active = 'active',
  Inactive = 'inactive',
}

/**
 * HTL-04: A bookable date range.
 * startDate is inclusive.
 * endDate is exclusive.
 */
@Schema({ _id: false })
export class RoomAvailabilityRange {
  @Prop({
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  })
  startDate: string;

  @Prop({
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  })
  endDate: string;
}

export const RoomAvailabilityRangeSchema = SchemaFactory.createForClass(RoomAvailabilityRange);

@Schema({ timestamps: true, collection: 'rooms' })
export class Room {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
    index: true,
  })
  hotelId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    maxlength: 80,
  })
  roomLabel: string;

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
    select: false,
  })
  roomKey: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 80,
  })
  roomType: string;

  @Prop({
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  })
  beds: number;

  @Prop({
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  })
  maxOccupancy: number;

  @Prop({
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  })
  pricePerNightMinor: number;

  @Prop({
    type: String,
    enum: Object.values(RoomStatus),
    default: RoomStatus.Active,
    index: true,
  })
  status: RoomStatus;

  /**
   * HTL-04: Dates when the room is bookable.
   * Overlap prevention will be enforced atomically
   * by RoomsService.
   */
  @Prop({
    type: [RoomAvailabilityRangeSchema],
    default: [],
  })
  availabilityRanges: RoomAvailabilityRange[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type RoomDocument = HydratedDocument<Room>;

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ hotelId: 1, roomKey: 1 }, { unique: true });

RoomSchema.index({ hotelId: 1, status: 1 });
