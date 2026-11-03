import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

/** Add new actions here as features are built (GEN-07). */
export enum AuditAction {
  UserSuspended = 'user.suspended',
  UserReactivated = 'user.reactivated',
  ModeratorCreated = 'moderator.created',
  ModeratorSuspended = 'moderator.suspended',
  ModeratorReactivated = 'moderator.reactivated',
  PasswordResetByAdmin = 'user.password_reset',
  ProviderDeactivated = 'provider.deactivated',
  ProviderReactivated = 'provider.reactivated',
  ProviderCreated = 'provider.created',
  ContentHidden = 'content.hidden',
  ContentUnhidden = 'content.unhidden',
  ContentDeleted = 'content.deleted',
  ReportDismissed = 'report.dismissed',
  ReportResolved = 'report.resolved',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  actorRole: string;

  @Prop({ type: String, enum: Object.values(AuditAction), required: true, index: true })
  action: AuditAction;

  /** e.g. "user", "hotel", "airline", "post", "comment", "review", "itinerary", "report" */
  @Prop({ required: true, index: true })
  targetType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({ maxlength: 1000 })
  reason?: string;

  /** Small snapshot of what changed (never secrets). */
  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  ip?: string;

  createdAt?: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
