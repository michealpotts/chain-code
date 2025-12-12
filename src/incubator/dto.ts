import { ChainCallDTO, SubmitCallDTO } from "@gala-chain/api";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

import { SpeedUpTier } from "./types";

export class StartIncubationDto extends SubmitCallDTO {
  @IsString()
  userId: string;

  @IsString()
  eggId: string;
}

export class SpeedUpIncubationDto extends SubmitCallDTO {
  @IsString()
  sessionId: string; // Format: "userId:eggId"

  @IsEnum(["TIER_1", "TIER_2", "TIER_3"])
  tier: SpeedUpTier;

  @IsString()
  galaTokenInstance: string; // TokenInstanceKey query string for GALA tokens
}

export class ClaimCreatureDto extends SubmitCallDTO {
  @IsString()
  sessionId: string; // Format: "userId:eggId"
}

export class GetIncubationStatusDto extends ChainCallDTO {
  @IsString()
  sessionId: string;
}

export class GetUserIncubationsDto extends ChainCallDTO {
  @IsString()
  userId: string;
}

export class SetCreatureTokenClassDto extends SubmitCallDTO {
  @IsString()
  creatureTokenClassKey: string; // TokenClassKey query string
}

export class PauseIncubatorDto extends SubmitCallDTO {
  @IsOptional()
  paused?: boolean;
}

