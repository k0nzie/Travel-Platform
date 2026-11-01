import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Lazy Stripe client: the app still boots for teammates who have no Stripe keys. */
@Injectable()
export class StripeService {
  private instance?: Stripe;

  constructor(private readonly config: ConfigService) {}

  get client(): Stripe {
    if (!this.instance) {
      const key = this.config.get<string>('stripe.secretKey');
      if (!key) {
        throw new ServiceUnavailableException({
          message: 'Payments are not configured on this server',
          code: 'PAYMENTS_NOT_CONFIGURED',
        });
      }
      this.instance = new Stripe(key);
    }
    return this.instance;
  }

  /** True only with a test key outside production. Gates the test-confirm endpoint. */
  get isTestMode() {
    const key = this.config.get<string>('stripe.secretKey') ?? '';
    return key.startsWith('sk_test_') && this.config.get<string>('env') !== 'production';
  }

  /** PAY-01: rejects anything not signed by Stripe. */
  parseWebhook(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) {
      throw new ServiceUnavailableException({
        message: 'Payments are not configured on this server',
        code: 'PAYMENTS_NOT_CONFIGURED',
      });
    }
    if (!rawBody || !signature) throw new BadRequestException('Missing webhook signature');
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException({ message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
    }
  }
}
