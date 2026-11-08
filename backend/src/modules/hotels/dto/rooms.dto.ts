import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({
    example: '101',
    description: 'Room number or name, unique within the hotel',
  })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/, { message: 'Room label cannot be blank' })
  roomLabel: string;

  @ApiProperty({
    example: 'Deluxe Double',
  })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/, { message: 'Room type cannot be blank' })
  roomType: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  beds: number;

  @ApiProperty({
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  maxOccupancy: number;

  @ApiProperty({
    example: 25000,
    minimum: 1,
    description: 'Nightly price in integer minor units',
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  pricePerNightMinor: number;
}

/**
 * HTL-04: Defines one bookable date range for a room.
 */
export class CreateRoomAvailabilityDto {
  @ApiProperty({
    example: '2026-12-01',
    description: 'First bookable night, YYYY-MM-DD',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must use YYYY-MM-DD format',
  })
  startDate: string;

  @ApiProperty({
    example: '2026-12-10',
    description: 'Checkout boundary, exclusive, YYYY-MM-DD',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must use YYYY-MM-DD format',
  })
  endDate: string;
}
