import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** GEN-01 notification kinds. Add new ones here rather than using free text. */
export enum NotificationType {
  BookingConfirmed = 'booking_confirmed',
  BookingCancelled = 'booking_cancelled',
  BookingExpired = 'booking_expired',
  RefundIssued = 'refund_issued',
  RefundUpdated = 'refund_updated',
  FlightScheduleChanged = 'flight_schedule_changed',
  FlightCancelled = 'flight_cancelled',
  AccountSuspended = 'account_suspended',
  AccountReactivated = 'account_reactivated',
  ProviderDeactivated = 'provider_deactivated',
  ProviderReactivated = 'provider_reactivated',
  General = 'general',
}

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(NotificationType), required: true })
  type: NotificationType;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, maxlength: 2000 })
  message: string;

  /** Frontend route to open, e.g. "/bookings/flights/<id>". */
  @Prop()
  link?: string;

  /** Small structured payload (booking reference, amounts, ...). */
  @Prop({ type: Object })
  data?: Record<string, unknown>;

  @Prop({ type: Date, default: null, index: true })
  readAt: Date | null;

  createdAt?: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
