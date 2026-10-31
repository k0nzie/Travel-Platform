import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Webhook events already processed. Stripe redelivers, so each id is handled once. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'stripe_events', versionKey: false })
export class StripeEvent {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  type: string;

  createdAt?: Date;
}

export type StripeEventDocument = HydratedDocument<StripeEvent>;
export const StripeEventSchema = SchemaFactory.createForClass(StripeEvent);
// Stripe stops retrying after 3 days, so a month of history is plenty.
StripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
