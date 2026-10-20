import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PASSWORD_REGEX, PASSWORD_RULE_MESSAGE } from '../../../common/constants/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** ACC-09 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Mona Ahmed' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: '+201001234567', description: 'International format, 7–15 digits' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be 7–15 digits, optionally starting with +' })
  phone?: string;

  @ApiPropertyOptional({ example: 'EGP', description: 'Must be one of GET /api/reference/currencies' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'preferredCurrency must be a 3-letter currency code' })
  preferredCurrency?: string;
}

/** ACC-12: the user re-enters their password and explicitly confirms. */
export class DeactivateAccountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: true, description: 'Must be true' })
  @IsBoolean()
  @Equals(true, { message: 'You must confirm account deactivation' })
  confirm: boolean;
}

/** ACC-07a */
export class AdminResetPasswordDto {
  @ApiProperty({ example: 'TempPass123', description: PASSWORD_RULE_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  temporaryPassword: string;
}
