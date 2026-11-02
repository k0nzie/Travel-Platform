import { BadRequestException } from '@nestjs/common';

/**
 * Cancellation tiers shared by airlines (FLT-09) and hotels (HTL-10): each tier is a
 * whole-day threshold before departure / check-in and the refund percentage it gives.
 */
export interface CancellationTier {
  minDays: number;
  refundPercent: number;
}

/** FLT-09 / HTL-10: the highest threshold <= daysRemaining wins. No match means zero. */
export function computeRefundPercent(tiers: readonly CancellationTier[], daysRemaining: number): number {
  validateTiers(tiers);
  if (!Number.isFinite(daysRemaining)) throw new BadRequestException('daysRemaining must be finite');
  if (daysRemaining < 0) return 0;
  return (
    [...tiers].sort((a, b) => b.minDays - a.minDays).find((tier) => daysRemaining >= tier.minDays)?.refundPercent ?? 0
  );
}

/** FLT-09 / HTL-10: unique whole-day thresholds >= 0, refund 0..100. */
export function validateTiers(tiers: readonly CancellationTier[]) {
  if (!Array.isArray(tiers)) throw new BadRequestException('Invalid cancellation tiers');
  const sorted = [...tiers].sort((a, b) => a.minDays - b.minDays);
  sorted.forEach((tier, i) => {
    if (
      !Number.isInteger(tier.minDays) ||
      tier.minDays < 0 ||
      !Number.isFinite(tier.refundPercent) ||
      tier.refundPercent < 0 ||
      tier.refundPercent > 100 ||
      (i > 0 && tier.minDays === sorted[i - 1].minDays)
    ) {
      throw new BadRequestException('Invalid cancellation tiers');
    }
  });
}
