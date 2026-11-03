import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingPoliciesController, PaymentsController, RefundsController } from './payments.controller';
import { PaymentHooksService } from './payment-hooks.service';
import { PaymentsService } from './payments.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { StripeEvent, StripeEventSchema } from './schemas/stripe-event.schema';
import { StripeService } from './stripe.service';

/** Import in a booking module, then register a BookingConfirmationHandler with PaymentHooksService. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: StripeEvent.name, schema: StripeEventSchema },
    ]),
  ],
  controllers: [PaymentsController, BookingPoliciesController, RefundsController],
  providers: [PaymentsService, PaymentHooksService, StripeService],
  exports: [PaymentsService, PaymentHooksService],
})
export class PaymentsModule {}
