import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export enum CabinType { Economy = 'Economy', PremiumEconomy = 'Premium Economy', Business = 'Business', First = 'First' }
export enum FlightStatus { Scheduled = 'Scheduled', Departed = 'Departed', Completed = 'Completed', Cancelled = 'Cancelled' }
const positive = { validator: (v: number) => v > 0, message: 'Must be > 0' };
const integer = { validator: Number.isSafeInteger, message: 'Must be a safe integer' };

/** Subdocument _id is the cabinId for PATCH /flights/:id/cabins/:cabinId. Policies live on the Airline. */
@Schema()
export class Cabin {
  _id?: Types.ObjectId;
  @Prop({ required: true, enum: CabinType, type: String }) cabin: CabinType;
  @Prop({ required: true, validate: [integer, positive] }) capacity: number;
  @Prop({ required: true, validate: positive }) price: number;
  @Prop({ default: 0, min: 0, validate: integer }) held: number;
  @Prop({ default: 0, min: 0, validate: integer }) booked: number;
}
export const CabinSchema = SchemaFactory.createForClass(Cabin);

/** UTC instants with airport timezone snapshots; inventory updates never replace counters. */
@Schema({ timestamps: true, collection: 'flights' })
export class Flight {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Airline', index: true }) airlineId: Types.ObjectId;
  @Prop({ required: true, match: /^[A-Z0-9]{2,3}\d{1,4}$/ }) flightNumber: string;
  @Prop({ required: true }) origin: string;
  @Prop({ required: true }) destination: string;
  @Prop({ required: true }) originTimezone: string;
  @Prop({ required: true }) destinationTimezone: string;
  @Prop({ required: true }) departureAt: Date;
  /** FLT-03: UTC calendar day of departure, backing the same-day duplicate rule. */
  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ }) departureDay: string;
  @Prop({ required: true, validate: { validator: function (value: Date) {
    const departure = this.get('departureAt');
    return !departure || value > departure;
  }, message: 'Arrival must follow departure' } }) arrivalAt: Date;
  @Prop({ required: true }) currency: string;
  @Prop({ type: [CabinSchema], required: true, validate: { validator: (cabins: Cabin[]) =>
    cabins.length >= 1 && cabins.length <= 4 && new Set(cabins.map((c) => c.cabin)).size === cabins.length &&
    cabins.every((c) => c.held + c.booked <= c.capacity), message: 'Cabins must be unique and have capacity for occupied seats' } }) cabins: Cabin[];
  @Prop({ type: String, enum: FlightStatus, default: FlightStatus.Scheduled }) status: FlightStatus;
}
export type FlightDocument = HydratedDocument<Flight>;
export const FlightSchema = SchemaFactory.createForClass(Flight);
FlightSchema.index({ origin: 1, destination: 1, status: 1, departureAt: 1 });
FlightSchema.index({ airlineId: 1, flightNumber: 1, departureDay: 1 }, { unique: true });
