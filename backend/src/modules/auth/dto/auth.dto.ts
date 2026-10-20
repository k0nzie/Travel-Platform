import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PASSWORD_REGEX, PASSWORD_RULE_MESSAGE } from '../../../common/constants/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** ACC-01 */
export class RegisterDto {
  @ApiProperty({ example: 'Mona Ahmed' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({ example: 'mona@example.com' })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Travel2026', description: PASSWORD_RULE_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @ApiProperty({ example: true, description: 'Terms-and-privacy consent; must be true' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and privacy policy' })
  acceptTerms: boolean;
}

/** ACC-04 */
export class LoginDto {
  @ApiProperty({ example: 'mona@example.com' })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email: string;

  @ApiProperty({ example: 'Travel2026' })
  @IsString()
  @MaxLength(128)
  password: string;
}

/** ACC-08 */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ example: 'NewTravel2026', description: PASSWORD_RULE_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;
}
