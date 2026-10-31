import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { BookingType } from '../../../common/constants/enums';

export class CreatePaymentIntentDto {
  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiProperty()
  @IsMongoId()
  bookingId: string;

  @ApiProperty({ description: 'PAY-02: must be true. The policies come from GET /payments/checkout/...' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the booking policies before paying' })
  acceptPolicies: boolean;
}

export const TEST_PAYMENT_METHODS = ['pm_card_visa', 'pm_card_chargeDeclined'] as const;

export class TestConfirmDto {
  @ApiPropertyOptional({ enum: TEST_PAYMENT_METHODS, default: 'pm_card_visa' })
  @IsOptional()
  @IsIn(TEST_PAYMENT_METHODS)
  paymentMethod?: (typeof TEST_PAYMENT_METHODS)[number];
}
