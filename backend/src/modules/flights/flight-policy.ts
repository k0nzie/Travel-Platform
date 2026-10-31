import { BadRequestException } from '@nestjs/common';

export interface CancellationTier { minDays: number; refundPercent: number }

/** FLT-09: the highest threshold <= daysRemaining wins. No match means zero. */
export function computeRefundPercent(tiers: readonly CancellationTier[], daysRemaining: number): number {
  validateTiers(tiers);
  if (!Number.isFinite(daysRemaining)) throw new BadRequestException('daysRemaining must be finite');
  if (daysRemaining < 0) return 0;
  return [...tiers].sort((a, b) => b.minDays - a.minDays)
    .find((tier) => daysRemaining >= tier.minDays)?.refundPercent ?? 0;
}

/** FLT-09: unique whole-day thresholds >= 0, refund 0..100. */
export function validateTiers(tiers: readonly CancellationTier[]) {
  if (!Array.isArray(tiers)) throw new BadRequestException('Invalid cancellation tiers');
  const sorted = [...tiers].sort((a, b) => a.minDays - b.minDays);
  sorted.forEach((tier, i) => {
    if (!Number.isInteger(tier.minDays) || tier.minDays < 0 ||
        !Number.isFinite(tier.refundPercent) || tier.refundPercent < 0 || tier.refundPercent > 100 ||
        (i > 0 && tier.minDays === sorted[i - 1].minDays)) {
      throw new BadRequestException('Invalid cancellation tiers');
    }
  });
}

export interface BaggagePolicyInput {
  extraBagPrice: number;
  maxExtraBagsPerPassenger: number;
  cabins: { cabin: string; freeBags: number; maxWeightKg: number }[];
}

/** FLT-04/08: bag price > 0, max extra bags whole >= 0, per-cabin free bags whole >= 0, max weight > 0, cabins unique. */
export function validateBaggagePolicy(p: BaggagePolicyInput) {
  const bad = !p || !Number.isFinite(p.extraBagPrice) || p.extraBagPrice <= 0 ||
    !Number.isSafeInteger(p.maxExtraBagsPerPassenger) || p.maxExtraBagsPerPassenger < 0 || !Array.isArray(p.cabins) ||
    new Set(p.cabins.map((c) => c.cabin)).size !== p.cabins.length ||
    p.cabins.some((c) => !Number.isSafeInteger(c.freeBags) || c.freeBags < 0 || !Number.isFinite(c.maxWeightKg) || c.maxWeightKg <= 0);
  if (bad) throw new BadRequestException('Invalid baggage policy');
}
