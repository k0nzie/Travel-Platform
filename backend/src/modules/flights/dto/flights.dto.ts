import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsEnum, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CabinType } from '../schemas/flight.schema';
import { FlightBookingStatus } from '../schemas/flight-booking-view.schema';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateAirlineDto {
  @ApiProperty({ example: 'Nile Air' }) @IsString() @Length(2, 100) name: string;
  @ApiProperty({ example: 'NP' }) @Matches(/^[A-Z0-9]{2,3}$/) code: string;
  @ApiProperty({ example: 'EG' }) @Matches(/^[A-Z]{2}$/) countryCode: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class UpdateAirlineDto extends PartialType(CreateAirlineDto, { skipNullProperties: false }) {}

export class CabinDto {
  @ApiProperty({ enum: CabinType }) @IsEnum(CabinType) cabin: CabinType;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(1000) capacity: number;
  @ApiProperty({ minimum: 0, description: 'Per seated passenger in platform currency' }) @IsNumber() @Min(0) price: number;
}
export class BaggagePolicyDto {
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) cabinKg: number;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) checkedKg: number;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) extraKgPrice: number;
}
export class CancellationTierDto {
  @ApiProperty({ minimum: 0, description: 'Inclusive whole-day threshold before departure' }) @IsInt() @Min(0) minDays: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) refundPercent: number;
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
  @ApiProperty({ type: [CabinDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => CabinDto) cabins: CabinDto[];
  @ApiProperty({ type: BaggagePolicyDto }) @IsDefined() @IsObject() @ValidateNested() @Type(() => BaggagePolicyDto) baggagePolicy: BaggagePolicyDto;
  @ApiProperty({ type: [CancellationTierDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CancellationTierDto) cancellationTiers: CancellationTierDto[];
}
export class UpdateFlightDto extends PartialType(OmitType(CreateFlightDto, ['airlineId'] as const), { skipNullProperties: false }) {}

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
  @ApiPropertyOptional({ enum: FlightBookingStatus }) @IsOptional() @IsEnum(FlightBookingStatus) status?: FlightBookingStatus;
  @ApiPropertyOptional({ enum: CabinType }) @IsOptional() @IsEnum(CabinType) cabin?: CabinType;
  @ApiPropertyOptional({ description: 'Literal case-insensitive reference substring' }) @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC booking creation day, YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ description: 'Inclusive UTC booking creation day, YYYY-MM-DD' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
