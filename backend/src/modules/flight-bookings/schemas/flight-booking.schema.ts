import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingStatus } from '../../../common/constants/enums';
import { AirportInfo, BaggagePolicy, CancellationTier, PassengerType } from '../ports/flight-inventory.port';

@Schema({ _id: false })
export class BookingPassenger {
  @Prop({ type: String, enum: Object.values(PassengerType), required: true })
  type: PassengerType;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true })
  dateOfBirth: Date;

  /** ISO 3166-1 alpha-2 */
  @Prop({ required: true, uppercase: true })
  nationality: string;

  @Prop({ required: true, uppercase: true, trim: true })
  passportNumber: string;

  @Prop({ default: 0, min: 0 })
  extraBags: number;

  /** Assigned on confirmation (FLT-23). */
  @Prop()
  ticketNumber?: string;
}
const BookingPassengerSchema = SchemaFactory.createForClass(BookingPassenger);

/**
 * Copy of the flight taken when the booking was made. Fares and policies stay as
 * accepted (PAY-02) even if the airline edits them later. Times are updated by
 * applyScheduleChange when the airline reschedules.
 */
@Schema({ _id: false })
export class BookingLeg {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  flightId: Types.ObjectId;

  @Prop({ required: true })
  flightNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  airlineId: Types.ObjectId;

  @Prop({ required: true })
  airlineName: string;

  @Prop({ type: Object, required: true })
  origin: AirportInfo;

  @Prop({ type: Object, required: true })
  destination: AirportInfo;

  @Prop({ required: true })
  departureAt: Date;

  @Prop({ required: true })
  arrivalAt: Date;

  @Prop({ required: true })
  cabinClass: string;

  @Prop({ required: true })
  fareMinor: number;

  @Prop({ required: true })
  baggageMinor: number;

  @Prop({ type: Object, required: true })
  baggagePolicy: BaggagePolicy;

  @Prop({ type: [Object], required: true })
  cancellationTiers: CancellationTier[];
}
const BookingLegSchema = SchemaFactory.createForClass(BookingLeg);

@Schema({ _id: false })
export class BookingCancellation {
  @Prop({ required: true, enum: ['user', 'airline'] })
  cancelledBy: 'user' | 'airline';

  @Prop({ required: true })
  refundMinor: number;

  @Prop()
  reason?: string;
}
const BookingCancellationSchema = SchemaFactory.createForClass(BookingCancellation);

@Schema({ timestamps: true, collection: 'flight_bookings' })
export class FlightBooking {
  /** Shown to the traveller and printed on the e-ticket (FLT-23). */
  @Prop({ required: true, unique: true })
  reference: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(BookingStatus), default: BookingStatus.PendingPayment, index: true })
  status: BookingStatus;

  /** One leg for one-way, two for round-trip. */
  @Prop({ type: [BookingLegSchema], required: true })
  legs: BookingLeg[];

  @Prop({ type: [BookingPassengerSchema], required: true })
  passengers: BookingPassenger[];

  /** Passengers with a seat. Infants travel on a lap. */
  @Prop({ required: true, min: 1 })
  seatCount: number;

  @Prop({ required: true })
  totalMinor: number;

  /** PAY-04 */
  @Prop({ required: true, uppercase: true })
  currency: string;

  /** First departure and last arrival: denormalised so lists and jobs can filter on them. */
  @Prop({ required: true, index: true })
  departureAt: Date;

  @Prop({ required: true })
  lastArrivalAt: Date;

  /** FLT-22 */
  @Prop({ required: true })
  holdExpiresAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;

  @Prop({ type: BookingCancellationSchema })
  cancellation?: BookingCancellation;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  expiredAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type FlightBookingDocument = HydratedDocument<FlightBooking>;
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
FlightBookingSchema.index({ status: 1, holdExpiresAt: 1 });
FlightBookingSchema.index({ status: 1, lastArrivalAt: 1 });
FlightBookingSchema.index({ userId: 1, departureAt: -1 });
