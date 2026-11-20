import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * HTL-01: Hotel details supplied by an administrator.
 */
export class CreateHotelDto {
  @ApiProperty({ example: 'Nile Palace Hotel' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiProperty({ example: '15 Nile Street, Cairo' })
  @IsString()
  @Length(5, 500)
  address: string;

  @ApiProperty({
    description: 'ID of a city from the shared reference database',
  })
  @IsMongoId()
  cityId: string;

  @ApiPropertyOptional({
    example: 'A luxury hotel overlooking the Nile.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  starClass: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['Free Wi-Fi', 'Swimming pool', 'Parking'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  amenities?: string[];
}

/**
 * HTL-01: A hotel moderator can update selected profile fields.
 * Every field is optional for PATCH requests.
 */
export class UpdateHotelDto extends PartialType(CreateHotelDto, { skipNullProperties: false }) {}
