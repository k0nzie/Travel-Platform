import { Injectable, Logger } from '@nestjs/common';

/**
 * Returns a human-readable reason when the account must NOT be deactivated,
 * or null when this module has no objection.
 */
export type DeactivationCheck = (userId: string) => Promise<string | null>;

/**
 * Lets other modules take part in account deactivation (ACC-12) without the
 * Users module importing them (avoids circular imports).
 *
 * Flight / hotel booking modules register a check in onModuleInit:
 *
 *   constructor(private hooks: AccountHooksService) {}
 *   onModuleInit() {
 *     this.hooks.registerDeactivationCheck('flight-bookings', async (userId) => {
 *       const n = await this.model.countDocuments({ userId, status: 'confirmed', departureAt: { $gt: new Date() } });
 *       return n ? `You have ${n} upcoming confirmed flight booking(s)` : null;
 *     });
 *   }
 */
@Injectable()
export class AccountHooksService {
  private readonly logger = new Logger(AccountHooksService.name);
  private readonly checks = new Map<string, DeactivationCheck>();

  registerDeactivationCheck(name: string, check: DeactivationCheck) {
    this.checks.set(name, check);
    this.logger.log(`Registered deactivation check: ${name}`);
  }

  /** Runs every registered check and returns all blocking reasons. */
  async getDeactivationBlockers(userId: string): Promise<string[]> {
    const results = await Promise.all([...this.checks.values()].map((check) => check(userId)));
    return results.filter((reason): reason is string => !!reason);
  }
}
