import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { validateBaggagePolicy, validateTiers } from '../flight-policy';
import { CabinType } from './flight.schema';

export enum AirlineStatus { Active = 'active', Suspended = 'suspended' }

@Schema({ _id: false })
export class CabinBaggageAllowance {
  @Prop({ required: true, enum: CabinType, type: String }) cabin: CabinType;
  @Prop({ required: true, min: 0, validate: { validator: Number.isSafeInteger, message: 'Must be a whole number' } }) freeBags: number;
  @Prop({ required: true, validate: { validator: (v: number) => v > 0, message: 'Must be > 0' } }) maxWeightKg: number;
}
export const CabinBaggageAllowanceSchema = SchemaFactory.createForClass(CabinBaggageAllowance);

/** FLT-08: airline-level baggage rules shared by all of the airline's flights. */
@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ required: true, validate: { validator: (v: number) => v > 0, message: 'Must be > 0' } }) extraBagPrice: number;
  @Prop({ required: true, min: 0, validate: { validator: Number.isSafeInteger, message: 'Must be a whole number' } }) maxExtraBagsPerPassenger: number;
  @Prop({ type: [CabinBaggageAllowanceSchema], default: [] }) cabins: CabinBaggageAllowance[];
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

/** FLT-09: airline-level refund tiers. */
@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0, validate: { validator: Number.isSafeInteger, message: 'Must be a whole number' } }) minDays: number;
  @Prop({ required: true, min: 0, max: 100 }) refundPercent: number;
}
export const CancellationTierSchema = SchemaFactory.createForClass(CancellationTier);

/** FLT-01: provider identity. Logo files belong to MediaOwnerType.AirlineLogo. */
@Schema({ timestamps: true, collection: 'airlines' })
export class Airline {
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, unique: true, match: /^[A-Z0-9]{2,3}$/ }) code: string;
  @Prop({ required: true, match: /^[A-Z]{2}$/ }) countryCode: string;
  @Prop({ maxlength: 2000 }) description?: string;
  @Prop({ type: String, enum: AirlineStatus, default: AirlineStatus.Active, index: true }) status: AirlineStatus;
  @Prop({ type: BaggagePolicySchema, validate: { validator: (p: BaggagePolicy) => {
    try { validateBaggagePolicy(p); return true; } catch { return false; }
  }, message: 'Invalid baggage policy' } }) baggagePolicy?: BaggagePolicy;
  @Prop({ type: [CancellationTierSchema], default: [], validate: { validator: (t: CancellationTier[]) => {
    try { validateTiers(t); return true; } catch { return false; }
  }, message: 'Invalid cancellation tiers' } }) cancellationTiers: CancellationTier[];
}
export type AirlineDocument = HydratedDocument<Airline>;
export const AirlineSchema = SchemaFactory.createForClass(Airline);
