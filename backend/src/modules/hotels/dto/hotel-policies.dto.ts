
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * HTL-10: One cancellation policy threshold.
 * minDays is the inclusive number of days before check-in.
 */
export class HotelCancellationTierDto {
  @ApiProperty({
    minimum: 0,
    example: 7,
    description: 'Whole days before check-in; must be unique',
  })
  @IsInt()
  @Min(0)
  minDays: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    example: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercent: number;
}

/**
 * HTL-09/10: Replace the hotel's complete policy.
 */
export class PutHotelPoliciesDto {
  @ApiProperty({
    example: '14:00',
    description: 'Hotel local check-in time in HH:mm format',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkInTime: string;

  @ApiProperty({
    example: '12:00',
    description: 'Hotel local check-out time in HH:mm format',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkOutTime: string;

  @ApiProperty({
    type: [HotelCancellationTierDto],
    description:
      'Refund tiers. Each minDays threshold must be unique. ' +
      'An empty array means no refund tiers apply.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HotelCancellationTierDto)
  cancellationTiers: HotelCancellationTierDto[];
}
