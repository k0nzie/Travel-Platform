import { BadRequestException } from '@nestjs/common';

export interface CancellationTier { minDays: number; refundPercent: number }

/** Inclusive minimum days; the most specific eligible threshold wins. No match means zero. */
export function computeRefundPercent(tiers: readonly CancellationTier[], daysRemaining: number): number {
  validateTiers(tiers);
  if (!Number.isFinite(daysRemaining)) throw new BadRequestException('daysRemaining must be finite');
  if (daysRemaining < 0) return 0;
  return [...tiers].sort((a, b) => b.minDays - a.minDays)
    .find((tier) => daysRemaining >= tier.minDays)?.refundPercent ?? 0;
}

/** Duplicate thresholds are ambiguous; refund percentages must increase with notice. */
export function validateTiers(tiers: readonly CancellationTier[]) {
  const sorted = [...tiers].sort((a, b) => a.minDays - b.minDays);
  sorted.forEach((tier, i) => {
    if (!Number.isInteger(tier.minDays) || tier.minDays < 0 ||
        !Number.isFinite(tier.refundPercent) || tier.refundPercent < 0 || tier.refundPercent > 100 ||
        (i > 0 && (tier.minDays === sorted[i - 1].minDays || tier.refundPercent < sorted[i - 1].refundPercent))) {
      throw new BadRequestException('Invalid cancellation tiers');
    }
  });
}
