import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingStatus } from '../../../common/constants/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CabinType } from '../../flights/schemas/flight.schema';
import { PassengerType } from '../ports/flight-inventory.port';

export const MAX_PASSENGERS = 9;
const LATIN_NAME = /^[\p{Script=Latin}][\p{Script=Latin} .'-]*$/u;
const LATIN_NAME_MESSAGE = 'Enter the name in Latin letters, as on the passport';

export class BookingLegDto {
  @ApiProperty()
  @IsMongoId()
  flightId: string;

  @ApiProperty({ enum: CabinType, example: CabinType.Economy })
  @IsEnum(CabinType)
  cabinClass: CabinType;
}

export class PassengerDto {
  @ApiProperty({ enum: PassengerType })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiProperty({ example: 'Sara' })
  @IsString()
  @MaxLength(60)
  @Matches(LATIN_NAME, { message: LATIN_NAME_MESSAGE })
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  @MaxLength(60)
  @Matches(LATIN_NAME, { message: LATIN_NAME_MESSAGE })
  lastName: string;

  @ApiProperty({ example: '1995-04-20' })
  @IsDateString({ strict: true })
  dateOfBirth: string;

  @ApiProperty({ example: 'EG', description: 'ISO country code from GET /reference/countries' })
  @IsString()
  @Length(2, 2)
  nationality: string;

  @ApiProperty({ example: 'A12345678' })
  @Matches(/^[A-Za-z0-9]{5,20}$/, { message: 'passportNumber must be 5-20 letters or digits' })
  passportNumber: string;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'FLT-19: bags beyond the included allowance, up to the airline maximum' })
  @IsOptional()
  @IsInt()
  @Min(0)
  extraBags?: number = 0;
}

export class CreateFlightBookingDto {
  @ApiProperty({ type: [BookingLegDto], description: 'One leg for one-way, outbound + return for round-trip' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => BookingLegDto)
  legs: BookingLegDto[];

  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PASSENGERS)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];
}

export class FlightBookingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'], description: 'FLT-25 groups' })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  scope?: 'upcoming' | 'past' | 'cancelled';
}

export class CancelFlightBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
