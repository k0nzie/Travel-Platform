import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BudgetCategory } from '../schemas/budget-entry.schema';
import { TransportMode } from '../schemas/transport-cost.schema';
import { CURRENCY, DATE_ONLY, HHMM } from './itinerary.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** Max 100 million major units, in minor units. */
const MAX_AMOUNT_MINOR = 10_000_000_000;

// ---------- activities (ITN-10) ----------

export class CreateActivityDto {
  @ApiProperty({ example: 'Visit the Egyptian Museum', maxLength: 120 })
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

  @ApiPropertyOptional({ example: '09:30', description: 'HH:mm' })
  @IsOptional()
  @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00', description: 'HH:mm, after startTime' })
  @IsOptional()
  @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'att-1', description: "Official attraction id (must be in the day's city)" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  attractionId?: string;
}

export class UpdateActivityDto extends PartialType(CreateActivityDto) {}

// ---------- budget entries (ITN-14) ----------

export class CreateBudgetEntryDto {
  @ApiProperty({ enum: BudgetCategory })
  @IsEnum(BudgetCategory)
  category: BudgetCategory;

  @ApiProperty({ example: 4500, description: 'Amount in minor units (4500 = 45.00)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor: number;

  @ApiProperty({ example: 'EGP', description: 'Supported currency code (Countries.csv)' })
  @Transform(upper)
  @Matches(CURRENCY, { message: 'currency must be a 3-letter code' })
  currency: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateBudgetEntryDto extends PartialType(CreateBudgetEntryDto) {}

// ---------- intercity transport (ITN-16) ----------

export class CreateTransportCostDto {
  @ApiProperty({ example: 'cairo', description: 'Official city_id or city _id' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fromCityId: string;

  @ApiProperty({ example: 'luxor' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  toCityId: string;

  @ApiProperty({ enum: TransportMode })
  @IsEnum(TransportMode)
  mode: TransportMode;

  @ApiProperty({ example: 120000, description: 'Amount in minor units' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor: number;

  @ApiProperty({ example: 'EGP' })
  @Transform(upper)
  @Matches(CURRENCY, { message: 'currency must be a 3-letter code' })
  currency: string;

  @ApiPropertyOptional({ example: '2027-03-04', description: 'Travel date, YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'travelDate must be YYYY-MM-DD' })
  travelDate?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateTransportCostDto extends PartialType(CreateTransportCostDto) {}
