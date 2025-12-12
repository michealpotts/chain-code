import { Type } from "class-transformer";
import { IsArray, IsNumber, IsString, ValidateNested } from "class-validator";

import { Faction, Rarity } from "../eggs/types";

export const Generation = {
  BABY: "Baby",
  YOUNG: "Young",
  ADULT: "Adult"
} as const;
export type Generation = (typeof Generation)[keyof typeof Generation];

export class MetadataAttribute {
  @IsString()
  trait_type: string;

  @IsString()
  value: string;
}

export class CreatureMetadata {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  faction: string;

  @IsString()
  species: string;

  @IsString()
  rarity: string;

  @IsString()
  generation: string;

  @IsNumber()
  created_at: number;

  @ValidateNested({ each: true })
  @Type(() => MetadataAttribute)
  @IsArray()
  attributes: MetadataAttribute[];
}

export const CREATURE_RARITY_ORDER: Rarity[] = [
  Rarity.COMMON,
  Rarity.UNCOMMON,
  Rarity.RARE,
  Rarity.ENHANCED,
  Rarity.ARCANE,
  Rarity.EPIC,
  Rarity.LEGENDARY,
  Rarity.MYSTIC
];

export const BABY_GALA_COST = 500;
export const BABY_SOUL_COST = 1;
export const EVOLVE_GALA_COST = 500;
export const EVOLVE_SOUL_COST = 1;
export const MINT_EGG_GALA_COST = 500;
export const MINT_EGG_SOUL_COST = 1;
export const BURN_PERCENTAGE = 0.15;

