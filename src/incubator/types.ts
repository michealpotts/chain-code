import { Rarity } from "../eggs/types";

// Incubation time in hours by rarity
export const INCUBATION_TIME_HOURS: Record<Rarity, number> = {
  [Rarity.COMMON]: 18,
  [Rarity.UNCOMMON]: 24,
  [Rarity.RARE]: 30,
  [Rarity.ENHANCED]: 36,
  [Rarity.ARCANE]: 48,
  [Rarity.EPIC]: 60,
  [Rarity.LEGENDARY]: 72,
  [Rarity.MYSTIC]: 108,
};

// Speed-up tiers: hours reduced and GALA cost
export const SPEED_UP_TIERS = {
  TIER_1: { hours: 1, galaCost: 100 },
  TIER_2: { hours: 4, galaCost: 300 },
  TIER_3: { hours: 8, galaCost: 500 },
} as const;

export type SpeedUpTier = keyof typeof SPEED_UP_TIERS;

export const MAX_INCUBATIONS_PER_USER = 4;

