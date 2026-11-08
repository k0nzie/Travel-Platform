import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum RoomStatus {
  Active = 'active',
  Inactive = 'inactive',
}

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

  // Normalized room label, used to prevent duplicates.
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

  // Price in minor currency units, e.g. cents.
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

  createdAt?: Date;
  updatedAt?: Date;
}

export type RoomDocument = HydratedDocument<Room>;

export const RoomSchema = SchemaFactory.createForClass(Room);

// Room identifiers are unique within a hotel.
RoomSchema.index({ hotelId: 1, roomKey: 1 }, { unique: true });

// Supports hotel room listings and active-room searches.
RoomSchema.index({ hotelId: 1, status: 1 });
