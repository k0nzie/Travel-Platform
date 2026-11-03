import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { BookingType } from '../../../common/constants/enums';

/** PAY-02: body of POST /bookings/:type/:id/accept-policies. */
export class AcceptPoliciesDto {
  @ApiProperty({ example: true, description: 'Must be true: the traveller ticked the acceptance checkbox' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the booking policies before paying' })
  accept: boolean;
}

/** PAY-01: body of POST /payments. Policies must already be accepted. */
export class CreatePaymentDto {
  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiProperty()
  @IsMongoId()
  bookingId: string;
}

export const TEST_PAYMENT_METHODS = ['pm_card_visa', 'pm_card_chargeDeclined'] as const;

export class TestConfirmDto {
  @ApiPropertyOptional({ enum: TEST_PAYMENT_METHODS, default: 'pm_card_visa' })
  @IsOptional()
  @IsIn(TEST_PAYMENT_METHODS)
  paymentMethod?: (typeof TEST_PAYMENT_METHODS)[number];
}
