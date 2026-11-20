import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { BookingStatus } from '../../../common/constants/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PASSWORD_REGEX, PASSWORD_RULE_MESSAGE, ProviderType } from '../../../common/constants/enums';
import { ReportContentType } from '../schemas/content-report.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class CreateModeratorDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 100) name: string;
  @ApiProperty({ example: 'moderator@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;
  @ApiProperty({ description: PASSWORD_RULE_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  temporaryPassword: string;
  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) providerType: ProviderType;
  @ApiProperty({ description: 'ID of the one airline or hotel assigned to this moderator' })
  @IsString()
  providerId: string;
}
export class AccountStatusDto {
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class CreateReportDto {
  @ApiProperty({ enum: ReportContentType }) @IsEnum(ReportContentType) contentType: ReportContentType;
  @ApiProperty() @IsString() contentId: string;
  @ApiProperty({ minLength: 5, maxLength: 1000 }) @Transform(trim) @IsString() @Length(5, 1000) reason: string;
}
export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'hide', 'delete'] }) @IsString() @Matches(/^(dismiss|hide|delete)$/) action:
    | 'dismiss'
    | 'hide'
    | 'delete';
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ModerationActionDto {
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

/** ACC-17: all bookings, filterable by type, status and creation date range. */
export class AdminBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['flight', 'hotel'] }) @IsOptional() @IsIn(['flight', 'hotel']) type?:
    | 'flight'
    | 'hotel';
  @ApiPropertyOptional({ enum: BookingStatus }) @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Created on or after this date' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ example: '2026-12-31', description: 'Created on or before this date (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
