import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** A hotel stay is [checkIn, checkOut): check-out night is not charged. */
export class HotelStayQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2027-02-01', description: 'First night, YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn: string;

  @ApiProperty({ example: '2027-02-05', description: 'Check-out day (exclusive), YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut: string;
}

export enum HotelSearchSort {
  PriceAsc = 'price_asc',
  PriceDesc = 'price_desc',
  RatingAsc = 'rating_asc',
  RatingDesc = 'rating_desc',
}

export class HotelSearchQueryDto extends HotelStayQueryDto {
  @ApiPropertyOptional({ example: 'Cairo', description: 'Exact city name (case-insensitive)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({ example: 'EG', description: 'ISO two-letter country code' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @ApiProperty({ minimum: 1, example: 4, description: 'Total guests across the requested rooms' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number;

  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Number of rooms that must jointly hold all guests' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms?: number = 1;

  @ApiPropertyOptional({ minimum: 0, description: 'Nightly room price in minor currency units (inclusive)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPricePerNightMinor?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Nightly room price in minor currency units (inclusive)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPricePerNightMinor?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Hotels without reviews are excluded when set' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: HotelSearchSort, default: HotelSearchSort.PriceAsc })
  @IsOptional()
  @IsEnum(HotelSearchSort)
  sort?: HotelSearchSort = HotelSearchSort.PriceAsc;
}

/** HTL-15: all schedule-available rooms for one hotel and stay, paginated. */
export class AvailableHotelRoomsQueryDto extends HotelStayQueryDto {}
