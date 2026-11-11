import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BookingStatus } from '../../../common/constants/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Pagination and optional status filtering for moderator-scoped hotel reservations. */
export class HotelStaffBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
