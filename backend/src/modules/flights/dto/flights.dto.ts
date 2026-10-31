import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CabinType } from '../schemas/flight.schema';
import { AirlineStatus } from '../schemas/airline.schema';
import { BookingStatus } from '../../../common/constants/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateAirlineDto {
  @ApiProperty({ example: 'Nile Air' }) @IsString() @Length(2, 100) name: string;
  @ApiProperty({ example: 'NP' }) @Matches(/^[A-Z0-9]{2,3}$/) code: string;
  @ApiProperty({ example: 'EG' }) @Matches(/^[A-Z]{2}$/) countryCode: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: AirlineStatus, default: 'active', description: 'Only settable at creation by an admin' }) @IsOptional() @IsEnum(AirlineStatus) status?: AirlineStatus;
}
export class UpdateAirlineDto extends PartialType(OmitType(CreateAirlineDto, ['status'] as const), { skipNullProperties: false }) {}

export class CabinDto {
  @ApiProperty({ enum: CabinType }) @IsEnum(CabinType) cabin: CabinType;
  @ApiProperty({ minimum: 1, description: 'Whole seats > 0' }) @IsInt() @Min(1) @Max(1000) capacity: number;
  @ApiProperty({ description: 'Per seated passenger, > 0, platform currency' }) @IsNumber() @IsPositive() price: number;
}
/** PATCH /flights/:id/cabins/:cabinId: class is fixed once added. */
export class UpdateCabinDto {
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) @Max(1000) capacity?: number;
  @ApiPropertyOptional({ description: '> 0' }) @IsOptional() @IsNumber() @IsPositive() price?: number;
}
export class CabinAllowanceDto {
  @ApiProperty({ enum: CabinType }) @IsEnum(CabinType) cabin: CabinType;
  @ApiProperty({ minimum: 0, description: 'Free bags, whole number' }) @IsInt() @Min(0) freeBags: number;
  @ApiProperty({ description: 'Max kg per bag, > 0' }) @IsNumber() @IsPositive() maxWeightKg: number;
}
export class BaggagePolicyDto {
  @ApiProperty({ description: 'Price per extra bag, > 0' }) @IsNumber() @IsPositive() extraBagPrice: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) maxExtraBagsPerPassenger: number;
  @ApiProperty({ type: [CabinAllowanceDto] }) @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => CabinAllowanceDto) cabins: CabinAllowanceDto[];
}
export class CancellationTierDto {
  @ApiProperty({ minimum: 0, description: 'Inclusive whole-day threshold before departure; unique per policy' }) @IsInt() @Min(0) minDays: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) refundPercent: number;
}
export class CancellationPolicyDto {
  @ApiProperty({ type: [CancellationTierDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CancellationTierDto) tiers: CancellationTierDto[];
}
export class CreateFlightDto {
  @ApiProperty() @IsMongoId() airlineId: string;
  @ApiProperty({ example: 'NP101' }) @Matches(/^[A-Z0-9]{2,3}\d{1,4}$/) flightNumber: string;
  @ApiProperty({ description: 'Reference airport IATA or ObjectId', example: 'CAI' }) @IsString() @Length(3, 24) origin: string;
  @ApiProperty({ example: 'LHR' }) @IsString() @Length(3, 24) destination: string;
  @ApiProperty({ example: '2030-11-05T10:00', description: 'Origin wall time, no UTC offset. DST gaps/ambiguities rejected.' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) departureLocal: string;
  @ApiProperty({ example: '2030-11-05T13:00', description: 'Destination wall time, no UTC offset' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) arrivalLocal: string;
  @ApiProperty({ example: 'USD', description: 'Must equal platform currency' }) @Matches(/^[A-Z]{3}$/) currency: string;
  @ApiProperty({ type: [CabinDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => CabinDto) cabins: CabinDto[];
}
export class CabinChangeDto extends UpdateCabinDto {
  @ApiProperty({ enum: CabinType }) @IsEnum(CabinType) cabin: CabinType;
}
/** FLT-05: only airports (if unbooked), times, and per-cabin price/capacity. flightNumber, airlineId, currency are immutable. */
export class UpdateFlightDto extends PartialType(PickType(CreateFlightDto, ['origin', 'destination', 'departureLocal', 'arrivalLocal'] as const), { skipNullProperties: false }) {
  @ApiPropertyOptional({ type: [CabinChangeDto], description: 'Matched by cabin class; unlisted cabins unchanged' }) @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => CabinChangeDto) cabins?: CabinChangeDto[];
}

export enum FlightSort { Price = 'price', Duration = 'duration', Departure = 'departure' }
export class FlightSearchDto extends PaginationQueryDto {
  @ApiProperty({ example: 'CAI' }) @IsString() @Length(3, 24) origin: string;
  @ApiProperty({ example: 'LHR' }) @IsString() @Length(3, 24) destination: string;
  @ApiProperty({ example: '2030-11-05', description: 'Origin local calendar day' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) departureDate: string;
  @ApiPropertyOptional({ description: 'Destination local day; supplying it requests round-trip pairs' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) returnDate?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) adults?: number = 1;
  @ApiPropertyOptional({ default: 0, minimum: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(8) children?: number = 0;
  @ApiPropertyOptional({ default: 0, description: 'Lap infants; no seat; at most one per adult' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9) infants?: number = 0;
  @ApiPropertyOptional({ enum: CabinType }) @IsOptional() @IsEnum(CabinType) cabin?: CabinType;
  @ApiPropertyOptional({ minimum: 0, description: 'Minimum per seated passenger itinerary fare, platform currency' }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @ApiPropertyOptional({ minimum: 0, description: 'Maximum per seated passenger itinerary fare, platform currency' }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @ApiPropertyOptional({ enum: FlightSort, default: FlightSort.Price, description: 'Ascending; ties use departure then flight IDs' }) @IsOptional() @IsEnum(FlightSort) sort?: FlightSort = FlightSort.Price;
}

export class FlightBookingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus }) @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @ApiPropertyOptional({ enum: CabinType }) @IsOptional() @IsEnum(CabinType) cabin?: CabinType;
  @ApiPropertyOptional({ description: 'Literal case-insensitive reference substring' }) @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC booking creation day, YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC booking creation day, YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
