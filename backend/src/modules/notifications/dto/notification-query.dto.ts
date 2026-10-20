import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only unread notifications' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean;
}
