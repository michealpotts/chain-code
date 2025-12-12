import { ChainKey, ChainObject } from "@gala-chain/api";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

import { BABY_GALA_COST, BABY_SOUL_COST, EVOLVE_GALA_COST, EVOLVE_SOUL_COST, MINT_EGG_GALA_COST, MINT_EGG_SOUL_COST } from "./types";

export class CreatureSettings extends ChainObject {
  static INDEX_KEY = "GCCRSET";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public adminAddress: string;

  @IsString()
  public adminWallet: string;

  @IsString()
  public burnAddress: string;

  @IsBoolean()
  public paused: boolean;

  @IsArray()
  @IsString({ each: true })
  public authorizedContracts: string[];

  @IsNumber()
  public babyGalaCost: number;

  @IsNumber()
  public babySoulCost: number;

  @IsNumber()
  public evolveGalaCost: number;

  @IsNumber()
  public evolveSoulCost: number;

  @IsNumber()
  public mintEggGalaCost: number;

  @IsNumber()
  public mintEggSoulCost: number;

  constructor(params: {
    id: string;
    adminAddress: string;
    adminWallet: string;
    burnAddress: string;
    paused?: boolean;
    authorizedContracts?: string[];
    babyGalaCost?: number;
    babySoulCost?: number;
    evolveGalaCost?: number;
    evolveSoulCost?: number;
    mintEggGalaCost?: number;
    mintEggSoulCost?: number;
  }) {
    super();
    this.id = params.id;
    this.adminAddress = params.adminAddress;
    this.adminWallet = params.adminWallet;
    this.burnAddress = params.burnAddress;
    this.paused = params.paused ?? false;
    this.authorizedContracts = params.authorizedContracts ?? [];
    this.babyGalaCost = params.babyGalaCost ?? BABY_GALA_COST;
    this.babySoulCost = params.babySoulCost ?? BABY_SOUL_COST;
    this.evolveGalaCost = params.evolveGalaCost ?? EVOLVE_GALA_COST;
    this.evolveSoulCost = params.evolveSoulCost ?? EVOLVE_SOUL_COST;
    this.mintEggGalaCost = params.mintEggGalaCost ?? MINT_EGG_GALA_COST;
    this.mintEggSoulCost = params.mintEggSoulCost ?? MINT_EGG_SOUL_COST;
  }
}


