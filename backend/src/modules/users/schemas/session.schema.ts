import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Server-side login session (ACC-06, ACC-19). The refresh token is stored only as
 * a SHA-256 hash. `lastActivityAt` drives the 30-minute idle timeout and
 * `revokedAt` makes logout / suspension / password change take effect immediately.
 */
@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  refreshTokenHash: string;

  @Prop({ required: true })
  lastActivityAt: Date;

  /** Absolute refresh-token expiry; Mongo TTL index removes the doc afterwards. */
  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokedReason?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  ip?: string;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
