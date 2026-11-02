import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BookingType } from '../../common/constants/enums';
import { BookingConfirmationHandler } from './booking-confirmation-handler.interface';

/**
 * Plug-in point (see docs/CONVENTIONS.md, "Cross-module hooks"). Each booking module
 * implements BookingConfirmationHandler and registers it in onModuleInit:
 *
 *   constructor(private readonly paymentHooks: PaymentHooksService) {}
 *   onModuleInit() { this.paymentHooks.register(BookingType.Hotel, this); }
 */
@Injectable()
export class PaymentHooksService {
  private readonly logger = new Logger(PaymentHooksService.name);
  private readonly handlers = new Map<BookingType, BookingConfirmationHandler>();

  register(type: BookingType, handler: BookingConfirmationHandler) {
    this.handlers.set(type, handler);
    this.logger.log(`Registered payment handler: ${type}`);
  }

  /** Fails loudly when no module handles this booking type. */
  handlerFor(type: BookingType): BookingConfirmationHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new BadRequestException({
        message: `Payments for ${type} bookings are not available yet`,
        code: 'BOOKING_TYPE_NOT_SUPPORTED',
      });
    }
    return handler;
  }
}
