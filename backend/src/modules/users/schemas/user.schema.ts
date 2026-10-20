import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AccountStatus, ProviderType, Role } from '../../../common/constants/enums';

/** Embedded: a moderator manages exactly one provider (ACC-13). */
@Schema({ _id: false })
export class ModeratorAssignment {
  @Prop({ type: String, enum: Object.values(ProviderType), required: true })
  providerType: ProviderType;

  /** Airline or Hotel _id. Ref is resolved by providerType, so no static `ref`. */
  @Prop({ type: Types.ObjectId, required: true })
  providerId: Types.ObjectId;
}
const ModeratorAssignmentSchema = SchemaFactory.createForClass(ModeratorAssignment);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Salted bcrypt hash only (GEN-13). Never selected by default. */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: Object.values(Role), default: Role.User, index: true })
  role: Role;

  @Prop({ type: String, enum: Object.values(AccountStatus), default: AccountStatus.Active, index: true })
  status: AccountStatus;

  @Prop({ trim: true })
  phone?: string;

  /** ISO 4217 code from the seeded currencies list; used for itinerary budget display (ITN-18). */
  @Prop({ uppercase: true, default: 'USD' })
  preferredCurrency: string;

  @Prop({ type: ModeratorAssignmentSchema })
  moderatorAssignment?: ModeratorAssignment;

  /** ACC-01 consent timestamp. */
  @Prop()
  termsAcceptedAt?: Date;

  /** Forces a password change at next login (ACC-07a, ACC-13). */
  @Prop({ default: false })
  mustChangePassword: boolean;

  // ACC-05 lockout state
  @Prop({ default: 0, select: false })
  failedLoginAttempts: number;

  @Prop({ select: false })
  lockUntil?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  passwordChangedAt?: Date;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  deactivatedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// One moderator per provider.
UserSchema.index(
  { 'moderatorAssignment.providerType': 1, 'moderatorAssignment.providerId': 1 },
  { unique: true, partialFilterExpression: { moderatorAssignment: { $exists: true } } },
);
UserSchema.index({ name: 'text', email: 'text' });

/** Strip secrets whenever a user is serialised. */
UserSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret: any) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    return ret;
  },
});
