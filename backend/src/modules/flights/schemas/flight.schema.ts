import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { validateTiers } from '../flight-policy';

export enum CabinType { Economy = 'economy', Business = 'business', First = 'first' }
export enum FlightStatus { Scheduled = 'scheduled', Departed = 'departed', Completed = 'completed', Cancelled = 'cancelled' }
const integer = { validator: Number.isSafeInteger, message: 'Must be a safe integer' };

@Schema({ _id: false })
export class Cabin {
  @Prop({ required: true, enum: CabinType, type: String }) cabin: CabinType;
  @Prop({ required: true, min: 0, validate: integer }) capacity: number;
  @Prop({ required: true, min: 0 }) price: number;
  @Prop({ default: 0, min: 0, validate: integer }) held: number;
  @Prop({ default: 0, min: 0, validate: integer }) booked: number;
}
export const CabinSchema = SchemaFactory.createForClass(Cabin);

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ required: true, min: 0 }) cabinKg: number;
  @Prop({ required: true, min: 0 }) checkedKg: number;
  @Prop({ required: true, min: 0 }) extraKgPrice: number;
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0, validate: integer }) minDays: number;
  @Prop({ required: true, min: 0, max: 100 }) refundPercent: number;
}
export const CancellationTierSchema = SchemaFactory.createForClass(CancellationTier);

/** UTC instants with airport timezone snapshots; inventory updates never replace counters. */
@Schema({ timestamps: true, collection: 'flights' })
export class Flight {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Airline', index: true }) airlineId: Types.ObjectId;
  @Prop({ required: true, match: /^[A-Z0-9]{2,3}\d{1,4}$/ }) flightNumber: string;
  @Prop({ required: true }) origin: string;
  @Prop({ required: true }) destination: string;
  @Prop({ required: true }) originTimezone: string;
  @Prop({ required: true }) destinationTimezone: string;
  @Prop({ required: true }) departureAt: Date;
  @Prop({ required: true, validate: { validator: function (value: Date) {
    const departure = this.get('departureAt');
    return !departure || value > departure;
  }, message: 'Arrival must follow departure' } }) arrivalAt: Date;
  @Prop({ required: true }) currency: string;
  @Prop({ type: [CabinSchema], required: true, validate: { validator: (cabins: Cabin[]) =>
    cabins.length >= 1 && cabins.length <= 3 && new Set(cabins.map((c) => c.cabin)).size === cabins.length &&
    cabins.every((c) => c.held + c.booked <= c.capacity), message: 'Cabins must be unique and have capacity for occupied seats' } }) cabins: Cabin[];
  @Prop({ type: BaggagePolicySchema, required: true }) baggagePolicy: BaggagePolicy;
  @Prop({ type: [CancellationTierSchema], default: [], validate: { validator: (tiers: CancellationTier[]) => {
    try { validateTiers(tiers); return true; } catch { return false; }
  }, message: 'Invalid cancellation tiers' } }) cancellationTiers: CancellationTier[];
  @Prop({ type: String, enum: FlightStatus, default: FlightStatus.Scheduled }) status: FlightStatus;
}
export type FlightDocument = HydratedDocument<Flight>;
export const FlightSchema = SchemaFactory.createForClass(Flight);
FlightSchema.index({ origin: 1, destination: 1, status: 1, departureAt: 1 });
FlightSchema.index({ airlineId: 1, flightNumber: 1, departureAt: 1 }, { unique: true });
