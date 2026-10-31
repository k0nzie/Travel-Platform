import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { StripeEvent, StripeEventSchema } from './schemas/stripe-event.schema';
import { StripeService } from './stripe.service';

/** Import in a booking module, then register a BookingConfirmationHandler. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: StripeEvent.name, schema: StripeEventSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
