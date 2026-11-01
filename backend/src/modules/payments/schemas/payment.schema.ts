import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingType } from '../../../common/constants/enums';

export enum PaymentStatus {
  Pending = 'pending',
  Failed = 'failed', // last attempt declined; can be retried while the hold lasts (PAY-03)
  Canceled = 'canceled',
  Succeeded = 'succeeded',
  PartiallyRefunded = 'partially_refunded',
  Refunded = 'refunded',
}

/** Statuses a successful charge can still move out of. */
export const OPEN_PAYMENT_STATUSES = [PaymentStatus.Pending, PaymentStatus.Failed, PaymentStatus.Canceled];

export enum RefundStatus {
  Queued = 'queued', // recorded, not yet accepted by Stripe; the retry job picks these up
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

@Schema({ timestamps: true })
export class Refund {
  _id?: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ type: String, enum: Object.values(RefundStatus), default: RefundStatus.Queued })
  status: RefundStatus;

  @Prop({ required: true })
  reason: string;

  @Prop()
  stripeRefundId?: string;

  @Prop()
  lastError?: string;
}
const RefundSchema = SchemaFactory.createForClass(Refund);

/** One payment per booking; retries reuse it and its PaymentIntent (PAY-03). */
@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ type: String, enum: Object.values(BookingType), required: true })
  bookingType: BookingType;

  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  bookingReference: string;

  @Prop({ required: true })
  bookingLink: string;

  /** Integer minor units. */
  @Prop({ required: true, min: 1 })
  amountMinor: number;

  /** PAY-04: always the platform currency. */
  @Prop({ required: true, uppercase: true })
  currency: string;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.Pending, index: true })
  status: PaymentStatus;

  @Prop({ index: true, sparse: true, unique: true })
  stripePaymentIntentId?: string;

  /** PAY-02: when the traveller accepted, and exactly what they accepted. */
  @Prop({ required: true })
  policiesAcceptedAt: Date;

  @Prop({ type: Object, required: true })
  policiesSnapshot: Record<string, unknown>;

  @Prop({ default: 0 })
  failedAttempts: number;

  @Prop()
  lastError?: string;

  /** Id of the last failure already handled, so webhook + sync don't count it twice. */
  @Prop()
  lastFailureKey?: string;

  @Prop()
  paidAt?: Date;

  @Prop({ type: [RefundSchema], default: [] })
  refunds: Refund[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ bookingType: 1, bookingId: 1 }, { unique: true });
PaymentSchema.index({ 'refunds.status': 1 });
PaymentSchema.index({ 'refunds.stripeRefundId': 1 }, { sparse: true });
