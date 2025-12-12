import { createHash } from "crypto";

import BigNumber from "bignumber.js";

import {
  POOL_PERCENTAGE,
  DEFAULT_HATCH_TIME_HOURS,
  EggMetadata,
  MetadataAttribute,
  FACTION_ART_URIS,
  Faction,
  RARITY_THRESHOLDS,
  Rarity,
  SPECIES_BY_FACTION
} from "./types";

export function deterministicRandom(seed: string, slice = 8): number {
  const hash = createHash("sha256").update(seed).digest("hex");
  const sample = parseInt(hash.slice(0, slice), 16);
  return sample / Math.pow(16, slice);
}

export function pickFaction(seed: string): Faction {
  const factions = Object.values(Faction);
  const roll = deterministicRandom(seed);
  return factions[Math.floor(roll * factions.length)];
}

export function pickSpecies(faction: Faction, seed: string): string {
  const list = SPECIES_BY_FACTION[faction];
  const roll = deterministicRandom(seed);
  const index = Math.floor(roll * list.length);
  return list[index];
}

export function pickRarity(seed: string): Rarity {
  const roll = deterministicRandom(seed, 10); // more entropy
  const picked = RARITY_THRESHOLDS.find((r) => roll <= r.threshold);
  return picked ? picked.rarity : Rarity.MYSTIC;
}

export function buildMetadata(params: { id: string; faction: string; hatchTimeHours?: number }): EggMetadata {
  const factionName = params.faction;
  const uris = FACTION_ART_URIS[params.faction];

  const metadata = new EggMetadata();
  metadata.id = params.id;
  metadata.type = "egg";
  metadata.egg_type = `${factionName} Egg`;
  metadata.faction = params.faction;
  metadata.hatch_time_hours = params.hatchTimeHours ?? DEFAULT_HATCH_TIME_HOURS;
  metadata.image = uris.image;
  metadata.animation_url = uris.animation;
  metadata.attributes = [
    Object.assign(new MetadataAttribute(), { trait_type: "Category", value: "Egg" }),
    Object.assign(new MetadataAttribute(), { trait_type: "Faction", value: factionName }),
    Object.assign(new MetadataAttribute(), { trait_type: "IncubationTime", value: `${metadata.hatch_time_hours}h` })
  ];
  return metadata;
}

export function splitPayment(total: number): { pool: BigNumber; toAdmin: BigNumber } {
  const pool = new BigNumber(total).multipliedBy(POOL_PERCENTAGE);
  return { pool, toAdmin: new BigNumber(total).minus(pool) };
}

