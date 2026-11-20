import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** ACC-15: optional reason, recorded in the audit log and shown to the provider's moderators. */
export class ProviderStatusDto {
  @ApiPropertyOptional({ example: 'Repeated policy violations', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
