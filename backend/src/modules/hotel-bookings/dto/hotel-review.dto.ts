import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateHotelReviewDto {
  @ApiProperty({ description: 'Completed hotel reservation, not room ID' })
  @IsMongoId()
  bookingId: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  review?: string;
}

export class UpdateHotelReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Supply an empty string to clear review text' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  review?: string;
}

export class HotelReviewsQueryDto extends PaginationQueryDto {}
