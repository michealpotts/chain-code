import { ChainKey, ChainObject, StringEnumProperty } from "@gala-chain/api";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

import { DEFAULT_HATCH_TIME_HOURS, EggMetadata, Faction, Rarity } from "./types";

export class EggNFT extends ChainObject {
  static INDEX_KEY = "GCEGG";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public ownerAddress: string;

  @StringEnumProperty(Faction)
  public faction: Faction;

  @IsString()
  public species: string;

  @StringEnumProperty(Rarity)
  public rarity: Rarity;

  @IsBoolean()
  public isIncubating: boolean;

  @IsBoolean()
  public isHatched: boolean;

  @IsNumber()
  public hatchTimeHours: number;

  @IsOptional()
  @IsNumber()
  public hatchReadyAt?: number;

  @ValidateNested()
  @Type(() => EggMetadata)
  public metadata: EggMetadata;

  constructor(params: {
    id: string;
    ownerAddress: string;
    faction: Faction;
    species: string;
    rarity: Rarity;
    metadata: EggMetadata;
    hatchTimeHours?: number;
    hatchReadyAt?: number;
  }) {
    super();
    this.id = params.id;
    this.ownerAddress = params.ownerAddress;
    this.faction = params.faction;
    this.species = params.species;
    this.rarity = params.rarity;
    this.isIncubating = false;
    this.isHatched = false;
    this.metadata = params.metadata;
    this.hatchTimeHours = params.hatchTimeHours ?? DEFAULT_HATCH_TIME_HOURS;
    this.hatchReadyAt = params.hatchReadyAt;
  }
}

