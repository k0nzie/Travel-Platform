import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { BookingStatus } from '../../../common/constants/enums';

@Schema({ _id: false })
export class HotelBookedRoom {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  roomLabel: string;

  @Prop({ required: true })
  roomType: string;

  @Prop({ required: true, min: 0 })
  adults: number;

  @Prop({ type: [Number], default: [] })
  childrenAges: number[];

  @Prop({ required: true, min: 1 })
  maxOccupancy: number;

  /** Snapshot: changes to room price never change an existing booking. */
  @Prop({ required: true, min: 1 })
  pricePerNightMinor: number;

  @Prop({ required: true, min: 1 })
  totalMinor: number;
}
export const HotelBookedRoomSchema = SchemaFactory.createForClass(HotelBookedRoom);

@Schema({ _id: false })
export class HotelBookingCancellation {
  @Prop({ required: true, enum: ['user'] })
  cancelledBy: 'user';

  @Prop({ required: true, min: 0 })
  refundMinor: number;

  @Prop()
  reason?: string;
}

const HotelBookingCancellationSchema =
  SchemaFactory.createForClass(HotelBookingCancellation);

/** Owns a reservation of one or more individually bookable rooms (HTL-16/17/18). */
@Schema({ timestamps: true, collection: 'hotel_bookings' })
export class HotelBooking {
  @Prop({ required: true, unique: true })
  reference: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ required: true })
  hotelName: string;

  @Prop({ type: String, enum: Object.values(BookingStatus), default: BookingStatus.PendingPayment, index: true })
  status: BookingStatus;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  checkIn: string;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  checkOut: string;

  @Prop({ required: true, min: 1 })
  nights: number;

  @Prop({ type: [HotelBookedRoomSchema], required: true })
  rooms: HotelBookedRoom[];

  @Prop({ required: true, min: 1 })
  guestCount: number;

  @Prop({ required: true, min: 1 })
  totalMinor: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  /** Snapshot from HTL-09/10, displayed in checkout and confirmation. */
  @Prop({ required: true })
  checkInTime: string;

  @Prop({ required: true })
  checkOutTime: string;

  @Prop({ type: [Object], default: [] })
  cancellationTiers: { minDays: number; refundPercent: number }[];

  @Prop({ required: true })
  holdExpiresAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  expiredAt?: Date;

  @Prop({ type: HotelBookingCancellationSchema })
  cancellation?: HotelBookingCancellation;

  @Prop()
  cancelledAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export type HotelBookingDocument = HydratedDocument<HotelBooking>;
export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
HotelBookingSchema.index({ status: 1, holdExpiresAt: 1 });
HotelBookingSchema.index({ userId: 1, checkIn: -1 });
HotelBookingSchema.index({ hotelId: 1, status: 1, checkIn: 1 });
