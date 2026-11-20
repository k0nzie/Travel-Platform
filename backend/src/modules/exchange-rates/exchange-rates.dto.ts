import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Matches, Min } from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const CURRENCY = /^[A-Z]{3}$/;

export class LatestRatesQueryDto {
  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY, { message: 'base must be a 3-letter currency code' })
  base?: string;

  @ApiPropertyOptional({ example: 'EUR,EGP', description: 'Comma-separated currency codes' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(CURRENCY, { each: true, message: 'symbols must be 3-letter currency codes' })
  symbols?: string[];
}

export class ConvertQueryDto {
  @ApiProperty({ example: 12550, description: 'Amount in minor units (cents)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor: number;

  @ApiProperty({ example: 'USD' })
  @Transform(upper)
  @Matches(CURRENCY, { message: 'from must be a 3-letter currency code' })
  from: string;

  @ApiProperty({ example: 'EGP' })
  @Transform(upper)
  @Matches(CURRENCY, { message: 'to must be a 3-letter currency code' })
  to: string;
}
