import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class HotelRoomStatusQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2027-02-01', description: 'Inclusive day; past dates permitted for moderator reporting' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @ApiProperty({ example: '2027-02-05', description: 'Exclusive end date; at most 90 days' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
}
