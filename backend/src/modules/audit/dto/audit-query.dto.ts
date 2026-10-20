import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { AuditAction } from '../schemas/audit-log.schema';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ example: 'user' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  actorId?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
