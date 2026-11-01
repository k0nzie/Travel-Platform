import { AuthUser } from '../../common/interfaces/auth-user.interface';

/** What PaymentsService needs to know about a booking before charging for it. */
export interface BookingPaymentContext {
  ownerId: string;
  /** Integer minor units (cents), exactly what Stripe receives. */
  amountMinor: number;
  currency: string;
  reference: string;
  /** Frontend route used in notifications, e.g. "/bookings/flights/<id>". */
  link: string;
  holdExpiresAt: Date;
  /** PAY-02: shown before payment; a copy is stored on the payment once accepted. */
  policies: Record<string, unknown>;
}

/**
 * Implemented once per booking type and registered with
 * PaymentsService.registerHandler() in onModuleInit:
 *
 *   constructor(private payments: PaymentsService) {}
 *   onModuleInit() {
 *     this.payments.registerHandler(BookingType.Hotel, this);
 *   }
 */
export interface BookingConfirmationHandler {
  /**
   * Must check ownership (ACC-11) and throw if the booking can't be paid for:
   * already paid, not pending, or the 10-minute hold has passed.
   */
  getPaymentContext(bookingId: string, user: AuthUser): Promise<BookingPaymentContext>;

  /**
   * Payment went through. Moves the booking PendingPayment -> Confirmed.
   * Called again on webhook redelivery, so it must be idempotent.
   *
   * @returns false when the booking can no longer be confirmed (the hold expired
   * first); PaymentsService then refunds the customer in full.
   */
  onPaymentSucceeded(bookingId: string, paymentId: string): Promise<boolean>;
}
