import { ChainCallDTO, SubmitCallDTO } from "@gala-chain/api";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

import { Faction, Rarity } from "./types";

export class MintByUserDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsEnum(Faction)
  faction: Faction;

  @IsNumber()
  galaAmount: number;
}

export class MultiMintDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsNumber()
  galaAmount: number;
}

export class MintByParentsDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsEnum(Faction)
  faction: Faction;

  @IsString()
  species: string;

  @IsEnum(Rarity)
  rarity: Rarity;
}

export class BurnEggDto extends SubmitCallDTO {
  @IsString()
  ownerAddress: string;

  @IsString()
  id: string;
}

export class TransferEggDto extends SubmitCallDTO {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  id: string;
}

export class StartIncubationDto extends SubmitCallDTO {
  @IsString()
  id: string;
}

export class HatchDto extends SubmitCallDTO {
  @IsString()
  id: string;
}

export class PauseDto extends SubmitCallDTO {
  @IsBoolean()
  paused: boolean;
}

export class UpdateSettingsDto extends SubmitCallDTO {
  @IsOptional()
  @IsString()
  adminAddress?: string;

  @IsOptional()
  @IsString()
  poolAddress?: string;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  authorizedContracts?: string[];
}

export class FetchEggDto extends ChainCallDTO {
  @IsString()
  id: string;
}

export class FetchEggsByOwnerDto extends ChainCallDTO {
  @IsString()
  owner: string;

  @IsOptional()
  @IsEnum(Faction)
  faction?: Faction;

  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @IsOptional()
  @IsBoolean()
  isHatched?: boolean;

  @IsOptional()
  @IsBoolean()
  isIncubating?: boolean;
}