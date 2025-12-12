import { IsArray, IsBoolean, IsNumber, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// Keep runtime constants while making the TS type a plain string union
export const Faction = {
  FROST: "Frost",
  INFERNO: "Inferno",
  NATURE: "Nature",
  STORM: "Storm"
} as const;
export type Faction = (typeof Faction)[keyof typeof Faction];

export const Rarity = {
  COMMON: "Common",
  UNCOMMON: "Uncommon",
  RARE: "Rare",
  ENHANCED: "Enhanced",
  ARCANE: "Arcane",
  EPIC: "Epic",
  LEGENDARY: "Legendary",
  MYSTIC: "Mystic"
} as const;
export type Rarity = (typeof Rarity)[keyof typeof Rarity];

export const SPECIES_BY_FACTION: Record<Faction, string[]> = {
  [Faction.FROST]: [
    "Frostfang",
    "Glacier Bear",
    "Snowstride Lynx",
    "Cryo Serpent",
    "Moonlit Owl",
    "Shardback Tortoise",
    "Polar Howler Pup",
    "Frostmoth Larva",
    "Aurora Sprite",
    "Icehorn Staglet"
  ],
  [Faction.INFERNO]: [
    "Ember Pup",
    "Lava Wyrmling",
    "Cinder Imp",
    "Blazebat",
    "Molten Beetle",
    "Ashborne Cub",
    "Sulfur Serpent",
    "Infernal Moth",
    "Volcano Crab",
    "Flamehorn Calf"
  ],
  [Faction.NATURE]: [
    "Seedling Fawn",
    "Thorn Cub",
    "Mossback Turtle",
    "Bloom Caterling",
    "Spirit Foxling",
    "Root Serpent",
    "Breeze Sprite",
    "Verdant Lynx",
    "Petal Finch",
    "Stonepaw Cub"
  ],
  [Faction.STORM]: [
    "Sparkfang Pup",
    "Tempest Wyrmling",
    "Storm Imp",
    "Thunderbat",
    "Shock Beetle",
    "Cloudborne Cub",
    "Volt Serpent",
    "Stormmoth Larva",
    "Gale Sprite",
    "Thunderhoof Calf"
  ]
};

export const FACTION_ART_URIS: Record<
  Faction,
  {
    image: string;
    animation: string;
  }
> = {
  [Faction.FROST]: {
    image: "https://gateway.pinata.cloud/ipfs/bafybeid3sfqwu4innxxd7wunnapfvqhylstl6lstwvtffljwwbb5m74ffy",
    animation: "https://gateway.pinata.cloud/ipfs/bafybeibavb5x44nslaumby3wrbbuinok7rfpdi6ptjb52s7syynkt2znny"
  },
  [Faction.INFERNO]: {
    image: "https://gateway.pinata.cloud/ipfs/bafybeiaaty7r76r7mxsrqu2hrgt6jz2xcg3mwzpzbnbdtlboyym522joqe",
    animation: "https://gateway.pinata.cloud/ipfs/bafybeicffsncvmqantmzw3kzmltz6amanh3ta7wrhmntzi46s22ga4pjdu"
  },
  [Faction.NATURE]: {
    image: "https://gateway.pinata.cloud/ipfs/bafybeici6cf2ykq4bnwjbxfueg4w3sziu3ghm64dioaxidh6jg36mhqose",
    animation: "https://gateway.pinata.cloud/ipfs/bafybeidjfd7wp3olaonqwdzpe6uogblzna4mbgelhjq5cjcrbjjxr6ldk4"
  },
  [Faction.STORM]: {
    image: "https://gateway.pinata.cloud/ipfs/bafybeigcof4zyinovl7jzkudxgrndeztbekyddccvvkxwjqv63f4pzzubu",
    animation: "https://gateway.pinata.cloud/ipfs/bafybeic3uhoft3heswuvbc5j6borjx25c4sokfiyx7alejgcybrcodivfm"
  }
};

export const RARITY_THRESHOLDS: Array<{ rarity: Rarity; threshold: number }> = [
  { rarity: Rarity.COMMON, threshold: 0.45 },
  { rarity: Rarity.UNCOMMON, threshold: 0.65 },
  { rarity: Rarity.RARE, threshold: 0.8 },
  { rarity: Rarity.ENHANCED, threshold: 0.9 },
  { rarity: Rarity.ARCANE, threshold: 0.96 },
  { rarity: Rarity.EPIC, threshold: 0.99 },
  { rarity: Rarity.LEGENDARY, threshold: 0.999 },
  { rarity: Rarity.MYSTIC, threshold: 1 }
];

export class EggMetadata {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  egg_type: string;

  @IsString()
  faction: string;

  @IsNumber()
  hatch_time_hours: number;

  @IsString()
  image: string;

  @IsString()
  animation_url: string;

  @ValidateNested({ each: true })
  @Type(() => MetadataAttribute)
  @IsArray()
  attributes: MetadataAttribute[];
}

export class MetadataAttribute {
  @IsString()
  trait_type: string;

  @IsString()
  value: string;
}

export const DEFAULT_HATCH_TIME_HOURS = 72;
export const SINGLE_MINT_GALA_COST = 500;
export const MULTI_MINT_GALA_COST = 2000;
export const POOL_PERCENTAGE = 0.15;

