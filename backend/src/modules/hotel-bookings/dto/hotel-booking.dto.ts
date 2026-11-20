import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** HTL-16: one room and the adults/children actually assigned to it. */
export class HotelRoomGuestsDto {
  @ApiProperty({ description: 'ID of an individual room in the selected hotel' })
  @IsMongoId()
  roomId: string;

  @ApiProperty({ minimum: 0, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  adults: number;

  @ApiProperty({ type: [Number], example: [8, 12], description: 'Ages 0–17; empty array if no children' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  childrenAges: number[];
}

export class CreateHotelBookingDto {
  @ApiProperty({ description: 'All rooms must belong to this hotel' })
  @IsMongoId()
  hotelId: string;

  @ApiProperty({ example: '2027-02-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn: string;

  @ApiProperty({ example: '2027-02-03', description: 'Exclusive check-out date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut: string;

  @ApiProperty({ type: [HotelRoomGuestsDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HotelRoomGuestsDto)
  rooms: HotelRoomGuestsDto[];
}
