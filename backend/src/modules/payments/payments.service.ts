import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { BookingType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertOwner } from '../../common/utils/access.util';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingConfirmationHandler } from './booking-confirmation-handler.interface';
import { CreatePaymentIntentDto, TestConfirmDto } from './dto/payments.dto';
import {
  OPEN_PAYMENT_STATUSES,
  Payment,
  PaymentDocument,
  PaymentStatus,
  Refund,
  RefundStatus,
} from './schemas/payment.schema';
import { StripeEvent, StripeEventDocument } from './schemas/stripe-event.schema';
import { StripeService } from './stripe.service';

/** Intent states the customer can still pay from; retries reuse the same intent (PAY-03). */
const RESUMABLE_INTENT_STATUSES: Stripe.PaymentIntent.Status[] = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
];

const MAX_REFUND_BATCH = 50;

/**
 * Generic payments for both booking types (PAY-01, PAY-03, PAY-04). Everything
 * specific to flights or hotels sits behind BookingConfirmationHandler.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly handlers = new Map<BookingType, BookingConfirmationHandler>();

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(StripeEvent.name) private readonly eventModel: Model<StripeEventDocument>,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  registerHandler(type: BookingType, handler: BookingConfirmationHandler) {
    this.handlers.set(type, handler);
    this.logger.log(`Registered payment handler: ${type}`);
  }

  private handlerFor(type: BookingType) {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new BadRequestException({
        message: `Payments for ${type} bookings are not available yet`,
        code: 'BOOKING_TYPE_NOT_SUPPORTED',
      });
    }
    return handler;
  }

  // ---------- checkout ----------

  /** PAY-02: amount and policies the traveller must accept before paying. */
  async getCheckout(user: AuthUser, type: BookingType, bookingId: string) {
    const ctx = await this.handlerFor(type).getPaymentContext(bookingId, user);
    return {
      bookingType: type,
      bookingId,
      reference: ctx.reference,
      amountMinor: ctx.amountMinor,
      currency: ctx.currency,
      holdExpiresAt: ctx.holdExpiresAt,
      policies: ctx.policies,
    };
  }

  /** PAY-01 / PAY-03: starts a payment, or resumes the existing one after a failed attempt. */
  async createIntent(user: AuthUser, dto: CreatePaymentIntentDto) {
    const ctx = await this.handlerFor(dto.bookingType).getPaymentContext(dto.bookingId, user);
    const currency = this.config.get<string>('platformCurrency');
    if (ctx.currency !== currency) {
      throw new InternalServerErrorException(`Booking currency ${ctx.currency} is not the platform currency`);
    }

    const bookingId = new Types.ObjectId(dto.bookingId);
    const payment = await this.paymentModel
      .findOneAndUpdate(
        { bookingType: dto.bookingType, bookingId },
        {
          $set: { policiesAcceptedAt: new Date(), policiesSnapshot: ctx.policies },
          $setOnInsert: {
            userId: new Types.ObjectId(user.id),
            bookingReference: ctx.reference,
            bookingLink: ctx.link,
            amountMinor: ctx.amountMinor,
            currency,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException({ message: 'This booking is already paid', code: 'ALREADY_PAID' });
    }

    let intent = payment.stripePaymentIntentId
      ? await this.stripe.client.paymentIntents.retrieve(payment.stripePaymentIntentId)
      : null;
    if (!intent || !RESUMABLE_INTENT_STATUSES.includes(intent.status)) {
      intent = await this.stripe.client.paymentIntents.create(
        {
          amount: payment.amountMinor,
          currency: currency.toLowerCase(),
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          description: `Booking ${payment.bookingReference}`,
          metadata: {
            paymentId: String(payment._id),
            bookingType: dto.bookingType,
            bookingId: dto.bookingId,
          },
        },
        // A double click must not create a second chargeable intent.
        { idempotencyKey: `intent-${payment._id}-${payment.stripePaymentIntentId ?? 'first'}` },
      );
      await this.paymentModel
        .updateOne(
          { _id: payment._id },
          { stripePaymentIntentId: intent.id, status: PaymentStatus.Pending },
        )
        .exec();
    }

    return {
      paymentId: String(payment._id),
      clientSecret: intent.client_secret,
      amountMinor: payment.amountMinor,
      currency,
      holdExpiresAt: ctx.holdExpiresAt,
    };
  }

  async getOne(user: AuthUser, id: string) {
    const payment = await this.paymentModel.findById(id).select('-policiesSnapshot').lean().exec();
    if (!payment) throw new NotFoundException('Payment not found');
    assertOwner(payment.userId, user, { allowAdmin: true, resource: 'Payment' });
    return payment;
  }

  /** Same result as the webhook, for when it is delayed or can't reach this machine. */
  async sync(user: AuthUser, id: string) {
    const payment = await this.ownedPaymentWithIntent(user, id);
    await this.applyIntent(await this.stripe.client.paymentIntents.retrieve(payment.stripePaymentIntentId));
    return this.getOne(user, id);
  }

  /** There is no card form until Milestone 2, so this pays with a Stripe test card. */
  async testConfirm(user: AuthUser, id: string, dto: TestConfirmDto) {
    if (!this.stripe.isTestMode) throw new NotFoundException('Not found');
    const payment = await this.ownedPaymentWithIntent(user, id);
    try {
      await this.stripe.client.paymentIntents.confirm(payment.stripePaymentIntentId, {
        payment_method: dto.paymentMethod ?? 'pm_card_visa',
      });
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeCardError)) throw err;
    }
    return this.sync(user, id);
  }

  private async ownedPaymentWithIntent(user: AuthUser, id: string) {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    assertOwner(payment.userId, user, { resource: 'Payment' });
    if (!payment.stripePaymentIntentId) {
      throw new ConflictException({ message: 'Payment was not started', code: 'NO_PAYMENT_INTENT' });
    }
    return payment;
  }

  // ---------- webhook ----------

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const event = this.stripe.parseWebhook(rawBody, signature);
    try {
      await this.eventModel.create({ eventId: event.id, type: event.type });
    } catch (err) {
      if ((err as any)?.code === 11000) return { received: true, duplicate: true };
      throw err;
    }

    try {
      await this.dispatch(event);
    } catch (err) {
      // Forget the event so Stripe's retry gets processed instead of skipped.
      await this.eventModel.deleteOne({ eventId: event.id }).exec();
      throw err;
    }
    return { received: true };
  }

  private async dispatch(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.applyIntent(event.data.object);
        break;
      case 'refund.updated':
      case 'refund.failed':
      case 'charge.refund.updated':
        await this.applyRefundUpdate(event.data.object);
        break;
    }
  }

  private async applyIntent(intent: Stripe.PaymentIntent) {
    const payment = await this.paymentModel
      .findOne({
        $or: [
          { stripePaymentIntentId: intent.id },
          // The webhook can beat the save at the end of createIntent.
          ...(Types.ObjectId.isValid(intent.metadata?.paymentId) ? [{ _id: intent.metadata.paymentId }] : []),
        ],
      })
      .exec();
    if (!payment) {
      this.logger.warn(`Stripe intent ${intent.id} matches no payment`);
      return;
    }

    if (intent.status === 'succeeded') await this.onSucceeded(payment, intent);
    else if (intent.status === 'canceled') await this.onCanceled(payment);
    else if (intent.last_payment_error) await this.onFailed(payment, intent);
  }

  private async onSucceeded(payment: PaymentDocument, intent: Stripe.PaymentIntent) {
    if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) return;

    // Booking first: if this throws, the payment stays open and the retry runs it again.
    const confirmed = await this.handlerFor(payment.bookingType).onPaymentSucceeded(
      String(payment.bookingId),
      String(payment._id),
    );

    // Paid after the hold expired: the seats are gone, so the money goes straight back.
    const lateRefund = confirmed ? {} : { $push: { refunds: { amountMinor: payment.amountMinor, reason: 'late_payment' } } };
    const claimed = await this.paymentModel
      .findOneAndUpdate(
        { _id: payment._id, status: { $in: OPEN_PAYMENT_STATUSES } },
        {
          $set: {
            status: PaymentStatus.Succeeded,
            paidAt: new Date(),
            stripePaymentIntentId: intent.id,
            lastError: null,
          },
          ...lateRefund,
        },
        { new: true },
      )
      .exec();
    if (claimed && !confirmed) await this.sendQueuedRefunds(claimed);
  }

  private async onFailed(payment: PaymentDocument, intent: Stripe.PaymentIntent) {
    const failureKey = String(intent.latest_charge ?? intent.last_payment_error.message);
    const message = intent.last_payment_error.message ?? 'Your card was declined';
    const updated = await this.paymentModel
      .findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: [PaymentStatus.Pending, PaymentStatus.Failed] },
          lastFailureKey: { $ne: failureKey },
        },
        {
          status: PaymentStatus.Failed,
          lastError: message,
          lastFailureKey: failureKey,
          $inc: { failedAttempts: 1 },
        },
      )
      .exec();
    if (updated) {
      await this.notifications.notify(payment.userId, {
        type: NotificationType.PaymentFailed,
        title: 'Payment failed',
        message: `Payment for booking ${payment.bookingReference} failed: ${message} You can retry before your hold expires.`,
        link: payment.bookingLink,
        data: { paymentId: String(payment._id), reference: payment.bookingReference },
      });
    }
  }

  private async onCanceled(payment: PaymentDocument) {
    await this.paymentModel
      .updateOne(
        { _id: payment._id, status: { $in: [PaymentStatus.Pending, PaymentStatus.Failed] } },
        { status: PaymentStatus.Canceled },
      )
      .exec();
  }

  /** Hold expired: stop a late charge where possible. A charge that slips through is refunded by onSucceeded. */
  async cancelOpenIntent(type: BookingType, bookingId: Types.ObjectId | string) {
    const payment = await this.paymentModel
      .findOne({
        bookingType: type,
        bookingId: new Types.ObjectId(String(bookingId)),
        status: { $in: [PaymentStatus.Pending, PaymentStatus.Failed] },
        stripePaymentIntentId: { $exists: true },
      })
      .exec();
    if (!payment) return;
    try {
      await this.stripe.client.paymentIntents.cancel(payment.stripePaymentIntentId);
      await this.onCanceled(payment);
    } catch (err) {
      this.logger.warn(`Could not cancel intent for payment ${payment._id}: ${(err as Error).message}`);
    }
  }

  // ---------- refunds ----------

  /**
   * Records a refund. Pass the caller's session so it commits together with the
   * booking cancellation, then call sendQueuedRefunds after the commit: if the
   * Stripe call fails or the server dies, the retry job still pays it.
   */
  async queueRefund(
    type: BookingType,
    bookingId: Types.ObjectId | string,
    amountMinor: number,
    reason: string,
    session?: ClientSession,
  ) {
    if (amountMinor <= 0) return null;
    return this.paymentModel
      .findOneAndUpdate(
        {
          bookingType: type,
          bookingId: new Types.ObjectId(String(bookingId)),
          status: PaymentStatus.Succeeded,
          amountMinor: { $gte: amountMinor },
          'refunds.0': { $exists: false }, // a booking is cancelled once, so it refunds once
        },
        { $push: { refunds: { amountMinor, reason } } },
        { new: true, session },
      )
      .exec();
  }

  async sendQueuedRefunds(payment: PaymentDocument | null) {
    if (!payment) return;
    for (const refund of payment.refunds.filter((r) => r.status === RefundStatus.Queued)) {
      await this.sendRefund(payment, refund);
    }
  }

  private async sendRefund(payment: PaymentDocument, refund: Refund) {
    const refundFilter = { _id: payment._id, 'refunds._id': refund._id };
    try {
      const result = await this.stripe.client.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: refund.amountMinor,
          metadata: { paymentId: String(payment._id), reason: refund.reason },
        },
        // The retry job can run this again; Stripe must only pay once.
        { idempotencyKey: `refund-${refund._id}` },
      );
      await this.paymentModel
        .updateOne(refundFilter, {
          status: refund.amountMinor >= payment.amountMinor ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded,
          'refunds.$.stripeRefundId': result.id,
          'refunds.$.status': this.mapRefundStatus(result.status),
          'refunds.$.lastError': null,
        })
        .exec();
      await this.notifications.notify(payment.userId, {
        type: NotificationType.RefundIssued,
        title: 'Refund issued',
        message: `A refund of ${this.formatAmount(refund.amountMinor, payment.currency)} for booking ${payment.bookingReference} is on its way.`,
        link: payment.bookingLink,
        data: { paymentId: String(payment._id), amountMinor: refund.amountMinor, reason: refund.reason },
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Refund ${refund._id} not sent, will retry: ${message}`);
      await this.paymentModel.updateOne(refundFilter, { 'refunds.$.lastError': message }).exec();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryQueuedRefunds() {
    const payments = await this.paymentModel
      .find({ 'refunds.status': RefundStatus.Queued })
      .limit(MAX_REFUND_BATCH)
      .exec();
    for (const payment of payments) await this.sendQueuedRefunds(payment);
  }

  private async applyRefundUpdate(stripeRefund: Stripe.Refund) {
    const status = this.mapRefundStatus(stripeRefund.status);
    const payment = await this.paymentModel
      .findOneAndUpdate(
        { refunds: { $elemMatch: { stripeRefundId: stripeRefund.id, status: { $ne: status } } } },
        { 'refunds.$.status': status },
        { new: true },
      )
      .exec();
    if (!payment) return;

    const failed = status === RefundStatus.Failed;
    if (failed) this.logger.error(`Stripe refund ${stripeRefund.id} failed on payment ${payment._id}`);
    await this.notifications.notify(payment.userId, {
      type: NotificationType.RefundUpdated,
      title: failed ? 'Refund failed' : 'Refund update',
      message: failed
        ? `The refund for booking ${payment.bookingReference} could not be completed. Please contact support.`
        : `The refund for booking ${payment.bookingReference} is now ${status}.`,
      link: payment.bookingLink,
      data: { paymentId: String(payment._id), status },
    });
  }

  private mapRefundStatus(status: string | null): RefundStatus {
    if (status === 'succeeded') return RefundStatus.Succeeded;
    if (status === 'failed' || status === 'canceled') return RefundStatus.Failed;
    return RefundStatus.Pending;
  }

  private formatAmount(amountMinor: number, currency: string) {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
