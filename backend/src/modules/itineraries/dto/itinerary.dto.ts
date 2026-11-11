import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ItineraryVisibility } from '../schemas/itinerary.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY = /^[A-Z]{3}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- itinerary (ITN-01, ITN-20) ----------

export class CreateItineraryDto {
  @ApiProperty({ example: 'Two weeks in Egypt', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: ['EG'], description: 'Official country codes (Countries.csv)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value,
  )
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'each country must be a 2-letter code' })
  @ArrayUnique()
  countryCodes: string[];

  @ApiProperty({ example: '2027-03-01', description: 'First day of the trip (YYYY-MM-DD)' })
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiPropertyOptional({ enum: ItineraryVisibility, default: ItineraryVisibility.Private })
  @IsOptional()
  @IsEnum(ItineraryVisibility)
  visibility?: ItineraryVisibility;

  @ApiPropertyOptional({ example: 'EUR', description: 'Default display currency for the budget summary' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY, { message: 'budgetCurrency must be a 3-letter code' })
  budgetCurrency?: string;
}

/** ITN-01 edit, ITN-20 visibility toggle (send { "visibility": "public" }). */
export class UpdateItineraryDto extends PartialType(CreateItineraryDto) {}

export class MyItinerariesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in title' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ItineraryVisibility })
  @IsOptional()
  @IsEnum(ItineraryVisibility)
  visibility?: ItineraryVisibility;
}

export enum PublicItinerarySort {
  Newest = 'newest',
  Oldest = 'oldest',
  Title = 'title',
}

/** ITN-20 / ITN-21: public search. */
export class PublicItinerarySearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Text in title or description' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ example: 'cairo', description: 'Official city_id or city _id visited on any day' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Minimum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  minDays?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Maximum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxDays?: number;

  @ApiPropertyOptional({ enum: PublicItinerarySort, default: PublicItinerarySort.Newest })
  @IsOptional()
  @IsEnum(PublicItinerarySort)
  sort?: PublicItinerarySort = PublicItinerarySort.Newest;
}

export class CloneItineraryDto {
  @ApiPropertyOptional({ description: 'Title for the copy (defaults to the original title)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: '2027-05-01', description: 'New start date (defaults to the original)' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;
}

// ---------- days (ITN-05, ITN-07, ITN-08) ----------

export class AddDayDto {
  @ApiProperty({ example: 'cairo', description: 'Official city_id (Cities.csv) or city _id' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityId: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ minimum: 1, description: '1-based position to insert at; appended when omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;
}

export class UpdateDayDto {
  @ApiPropertyOptional({ example: 'luxor' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReorderDaysDto {
  @ApiProperty({ type: [String], description: 'Every day id of the itinerary, in the new order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  dayIds: string[];
}

// ---------- context searches (ITN-25, ITN-26) ----------

export class ItineraryHotelSearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'luxor', description: 'City of the itinerary; defaults to its first city' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  guests?: number = 1;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  rooms?: number = 1;

  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'rating_asc', 'rating_desc'] })
  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'rating_asc', 'rating_desc'])
  sort?: string;
}

export class ItineraryFlightSearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Which move between cities to search flights for (1 = first change of city). Defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leg?: number = 1;

  @ApiPropertyOptional({
    example: 'cairo',
    description:
      'Optional home city: when given, searches flights from it to the first itinerary city on the start date (leg is ignored)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  fromCity?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults?: number = 1;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8)
  children?: number = 0;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants?: number = 0;
}

export class BudgetSummaryQueryDto {
  @ApiPropertyOptional({
    example: 'EUR',
    description: "Display currency; defaults to the itinerary's, then the user's",
  })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY, { message: 'currency must be a 3-letter code' })
  currency?: string;
}
