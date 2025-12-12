import { ChainCallDTO, SubmitCallDTO } from "@gala-chain/api";
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

import { Faction, Rarity } from "../eggs/types";
import { Generation } from "./types";

export class MintBabyDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsString()
  eggId: string;

  @IsNumber()
  galaAmount: number;

  @IsNumber()
  soulAmount: number;

  @IsOptional()
  @IsString()
  galaTokenInstance?: string;

  @IsOptional()
  @IsString()
  soulTokenInstance?: string;
}

export class EvolveDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsString()
  parentCreatureIdA: string;

  @IsString()
  parentCreatureIdB: string;

  @IsNumber()
  galaAmount: number;

  @IsNumber()
  soulAmount: number;

  @IsOptional()
  @IsString()
  galaTokenInstance?: string;

  @IsOptional()
  @IsString()
  soulTokenInstance?: string;
}

export class TransferCreatureDto extends SubmitCallDTO {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  id: string;
}

export class BurnCreatureDto extends SubmitCallDTO {
  @IsString()
  ownerId: string;

  @IsString()
  creatureId: string;
}

export class MintEggFromCreaturesDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsString()
  parentCreatureIdA: string;

  @IsString()
  parentCreatureIdB: string;

  @IsNumber()
  galaAmount: number;

  @IsNumber()
  soulAmount: number;

  @IsOptional()
  @IsString()
  galaTokenInstance?: string;

  @IsOptional()
  @IsString()
  soulTokenInstance?: string;
}

export class UpdateCreatureSettingsDto extends SubmitCallDTO {
  @IsOptional()
  @IsString()
  adminAddress?: string;

  @IsOptional()
  @IsString()
  adminWallet?: string;

  @IsOptional()
  @IsString()
  poolAddress?: string;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsString({ each: true })
  authorizedContracts?: string[];

  @IsOptional()
  @IsNumber()
  babyGalaCost?: number;

  @IsOptional()
  @IsNumber()
  babySoulCost?: number;

  @IsOptional()
  @IsNumber()
  evolveGalaCost?: number;

  @IsOptional()
  @IsNumber()
  evolveSoulCost?: number;

  @IsOptional()
  @IsNumber()
  mintEggGalaCost?: number;

  @IsOptional()
  @IsNumber()
  mintEggSoulCost?: number;
}

export class FetchCreatureDto extends ChainCallDTO {
  @IsString()
  id: string;
}

export class FetchCreaturesByOwnerDto extends ChainCallDTO {
  @IsString()
  owner: string;

  @IsOptional()
  @IsEnum(Generation)
  generation?: Generation;

  @IsOptional()
  @IsEnum(Faction)
  faction?: Faction;

  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;
}


