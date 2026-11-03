import { BadRequestException } from '@nestjs/common';

// Tier rules are shared with hotels (HTL-10), so they live in common/; re-exported for existing imports.
export type { CancellationTier } from '../../common/utils/cancellation-tiers';
export { computeRefundPercent, validateTiers } from '../../common/utils/cancellation-tiers';

export interface BaggagePolicyInput {
  extraBagPrice: number;
  maxExtraBagsPerPassenger: number;
  cabins: { cabin: string; freeBags: number; maxWeightKg: number }[];
}

/** FLT-04/08: bag price > 0, max extra bags whole >= 0, per-cabin free bags whole >= 0, max weight > 0, cabins unique. */
export function validateBaggagePolicy(p: BaggagePolicyInput) {
  const bad =
    !p ||
    !Number.isFinite(p.extraBagPrice) ||
    p.extraBagPrice <= 0 ||
    !Number.isSafeInteger(p.maxExtraBagsPerPassenger) ||
    p.maxExtraBagsPerPassenger < 0 ||
    !Array.isArray(p.cabins) ||
    new Set(p.cabins.map((c) => c.cabin)).size !== p.cabins.length ||
    p.cabins.some(
      (c) =>
        !Number.isSafeInteger(c.freeBags) || c.freeBags < 0 || !Number.isFinite(c.maxWeightKg) || c.maxWeightKg <= 0,
    );
  if (bad) throw new BadRequestException('Invalid baggage policy');
}
