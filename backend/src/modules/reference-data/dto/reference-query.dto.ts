import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CountryQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or code' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class CityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(2, 3)
  countryCode?: string;

  @ApiPropertyOptional({ description: 'Search by city name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AirportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by IATA code, airport name or city' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(2, 3)
  countryCode?: string;
}

export class AttractionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(2, 3)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
