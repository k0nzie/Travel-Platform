import { Injectable, Logger } from '@nestjs/common';

export interface FlightCancelledEvent { flightId: string; cancelledBookingIds: string[]; expiredBookingIds: string[]; refundPercent: 100 }
export type FlightCancellationHandler = (event: FlightCancelledEvent) => Promise<void>;

/**
 * FLT-06 handoff without circular imports. Person 3 imports FlightsModule, injects this and registers in onModuleInit:
 *
 *   onModuleInit() { this.flightHooks.registerCancellationHandler('bookings', (e) => this.refundAll(e)); }
 *
 * Flights has already marked confirmed bookings cancelled (refundPercent 100), pending_payment expired, zeroed holds
 * and notified passengers. Handlers issue the PAY-03 refunds and MUST be idempotent per booking id: a failing handler makes
 * runCancellation throw, the booking rows stay flagged handoffPending, and re-calling POST /flights/:id/cancel re-delivers
 * only those rows until every handler succeeds.
 */
@Injectable()
export class FlightHooksService {
  private readonly logger = new Logger(FlightHooksService.name);
  private readonly handlers = new Map<string, FlightCancellationHandler>();

  registerCancellationHandler(name: string, handler: FlightCancellationHandler) {
    this.handlers.set(name, handler);
    this.logger.log(`Registered flight cancellation handler: ${name}`);
  }

  async runCancellation(event: FlightCancelledEvent) {
    // No consumer registered (Person 3 absent/failed to register): fail so rows stay handoffPending for retry.
    if (!this.handlers.size) throw new Error('No refund handler registered; handoff stays pending');
    const failures: string[] = [];
    for (const [name, handler] of this.handlers) {
      try { await handler(event); } catch (error) {
        failures.push(name);
        this.logger.error(`Cancellation handler ${name} failed for flight ${event.flightId}: ${(error as Error).message}`);
      }
    }
    if (failures.length) throw new Error(`Cancellation handlers failed: ${failures.join(', ')}`);
  }
}
