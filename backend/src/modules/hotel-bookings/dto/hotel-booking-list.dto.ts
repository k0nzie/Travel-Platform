
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

import { BookingStatus } from '../../../common/constants/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class HotelBookingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['upcoming', 'past', 'cancelled'],
    description: 'HTL-20: Filter hotel reservations by group',
  })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  scope?: 'upcoming' | 'past' | 'cancelled';

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
