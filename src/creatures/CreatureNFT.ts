import { ChainKey, ChainObject, StringEnumProperty } from "@gala-chain/api";
import { Type } from "class-transformer";
import { IsNumber, IsString, ValidateNested } from "class-validator";

import { CreatureMetadata, Generation } from "./types";
import { Faction, Rarity } from "../eggs/types";

export class CreatureNFT extends ChainObject {
  static INDEX_KEY = "GCCRTR";

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

  @StringEnumProperty(Generation)
  public generation: Generation;

  @IsNumber()
  public createdAt: number;

  @ValidateNested()
  @Type(() => CreatureMetadata)
  public metadata: CreatureMetadata;

  constructor(params: {
    id: string;
    ownerAddress: string;
    faction: Faction;
    species: string;
    rarity: Rarity;
    generation: Generation;
    createdAt: number;
    metadata: CreatureMetadata;
  }) {
    super();
    this.id = params.id;
    this.ownerAddress = params.ownerAddress;
    this.faction = params.faction;
    this.species = params.species;
    this.rarity = params.rarity;
    this.generation = params.generation;
    this.createdAt = params.createdAt;
    this.metadata = params.metadata;
  }
}


