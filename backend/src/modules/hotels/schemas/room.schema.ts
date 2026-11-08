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

/**
 * HTL-06: A date range when a room is deliberately blocked.
 *
 * startDate is inclusive.
 * endDate is exclusive.
 *
 * Example:
 * A block from December 10 to December 15 prevents
 * the room from being booked for nights December 10–14.
 */
@Schema({ _id: false })
export class RoomBlockedRange {
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

  @Prop({
    trim: true,
    maxlength: 200,
  })
  reason?: string;
}

export const RoomBlockedRangeSchema = SchemaFactory.createForClass(RoomBlockedRange);

/**
 * Individual hotel room.
 *
 * HTL-03: Room identity, beds, occupancy, price and status.
 * HTL-04: Bookable availability ranges.
 * HTL-05: Room details and availability editing.
 * HTL-06: Blocked ranges and room lifecycle management.
 */
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
   * HTL-04: Dates when the room is normally bookable.
   *
   * Overlap prevention between availability ranges
   * is enforced atomically by RoomsService.
   */
  @Prop({
    type: [RoomAvailabilityRangeSchema],
    default: [],
  })
  availabilityRanges: RoomAvailabilityRange[];

  /**
   * HTL-06: Dates when the room is deliberately blocked.
   *
   * Blocked dates override bookable availability.
   * The room-search and booking logic must account
   * for these ranges when determining availability.
   */
  @Prop({
    type: [RoomBlockedRangeSchema],
    default: [],
  })
  blockedRanges: RoomBlockedRange[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type RoomDocument = HydratedDocument<Room>;

export const RoomSchema = SchemaFactory.createForClass(Room);

// HTL-03: Prevent duplicate room labels within the same hotel.
RoomSchema.index({ hotelId: 1, roomKey: 1 }, { unique: true });

// Room filtering by hotel and status.
RoomSchema.index({ hotelId: 1, status: 1 });
