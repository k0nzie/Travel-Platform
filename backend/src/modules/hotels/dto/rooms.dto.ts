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
