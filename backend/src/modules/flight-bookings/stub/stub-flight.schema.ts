import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AirportInfo, BaggagePolicy, CancellationTier, PassengerType } from '../ports/flight-inventory.port';

@Schema({ _id: false })
export class StubCabin {
  @Prop({ required: true })
  cabinClass: string;

  @Prop({ required: true, min: 0 })
  availableSeats: number;

  @Prop({ required: true, min: 0, default: 0 })
  heldSeats: number;

  @Prop({ required: true, min: 0, default: 0 })
  bookedSeats: number;

  @Prop({ type: Object, required: true })
  fares: Record<PassengerType, number>;
}
const StubCabinSchema = SchemaFactory.createForClass(StubCabin);

/** TEMPORARY stand-in for Person 2's flights collection. Delete with this folder. */
@Schema({ timestamps: true, collection: 'stub_flights' })
export class StubFlight {
  @Prop({ required: true })
  flightNumber: string;

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

  @Prop({ default: true })
  bookable: boolean;

  @Prop({ type: [StubCabinSchema], required: true })
  cabins: StubCabin[];

  @Prop({ type: Object, required: true })
  baggagePolicy: BaggagePolicy;

  @Prop({ type: [Object], required: true })
  cancellationTiers: CancellationTier[];
}

export type StubFlightDocument = HydratedDocument<StubFlight>;
export const StubFlightSchema = SchemaFactory.createForClass(StubFlight);
