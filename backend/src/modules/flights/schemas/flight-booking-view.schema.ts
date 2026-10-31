import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CabinType } from './flight.schema';

export enum FlightBookingStatus {
  Confirmed = 'Confirmed',
  Cancelled = 'Cancelled',
}

/**
 * Person 3 integration contract, one row per booked flight leg in flight_bookings.
 * Person 2 only reads these fields for FLT-29 moderator listing and CSV export.
 * Contract fields per T-0001: reference, passengerNames, cabin, seats, status.
 */
@Schema({ collection: 'flight_bookings', autoCreate: false, autoIndex: false, versionKey: false })
export class FlightBookingView {
  @Prop({ type: Types.ObjectId }) flightId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ required: true }) reference: string;
  @Prop({ type: [String], default: [] }) passengerNames: string[];
  @Prop({ type: String, enum: CabinType, required: true }) cabin: CabinType;
  @Prop({ required: true, min: 1 }) seats: number;
  @Prop({ type: String, enum: FlightBookingStatus, required: true }) status: FlightBookingStatus;
  @Prop() createdAt?: Date;
}

export const FlightBookingViewSchema = SchemaFactory.createForClass(FlightBookingView);
export const BOOKING_FIELDS = '_id flightId userId reference passengerNames cabin seats status createdAt';
