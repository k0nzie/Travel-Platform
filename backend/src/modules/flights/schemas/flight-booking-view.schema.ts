import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Schema as MongooseSchema } from 'mongoose';
import { BookingStatus } from '../../../common/constants/enums';
import { CabinType } from './flight.schema';

/**
 * Person 3 integration contract, one row per booked flight leg in flight_bookings.
 * Person 2 reads these for FLT-29 and, for FLT-06 only, flips status on flight cancellation
 * (confirmed -> cancelled with refundPercent 100, pending_payment -> expired) using the shared BookingStatus. Payments stay with Person 3.
 * Contract fields per T-0001: reference, passengerNames, cabin, seats, status.
 */
@Schema({ collection: 'flight_bookings', autoCreate: false, autoIndex: false, versionKey: false })
export class FlightBookingView {
  @Prop({ type: MongooseSchema.Types.ObjectId }) flightId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ required: true }) reference: string;
  @Prop({ type: [String], default: [] }) passengerNames: string[];
  @Prop({ type: String, enum: CabinType, required: true }) cabin: CabinType;
  @Prop({ required: true, min: 1 }) seats: number;
  @Prop({ type: String, enum: BookingStatus, required: true }) status: BookingStatus;
  @Prop({ min: 0, max: 100 }) refundPercent?: number;
  /** Set by FLT-06 when it flips a booking; cleared only after every cancellation handler succeeded (durable retry marker). */
  @Prop({ default: false }) handoffPending?: boolean;
  @Prop() createdAt?: Date;
}

export const FlightBookingViewSchema = SchemaFactory.createForClass(FlightBookingView);
export const BOOKING_FIELDS = '_id flightId userId reference passengerNames cabin seats status refundPercent createdAt';
