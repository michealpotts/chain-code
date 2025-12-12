import { ChainCallDTO, SubmitCallDTO } from "@gala-chain/api";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class BuySoulWithGalaDto extends SubmitCallDTO {
  @IsString()
  buyerAddress: string;

  @IsNumber()
  @Min(0.000001) 
  galaAmount: number; 

  @IsString()
  galaTokenInstance: string; 
}

export class GetSoulAmountDto extends ChainCallDTO {
  @IsNumber()
  @Min(0.000001)
  galaAmount: number;
}

export class SetExchangeRateDto extends SubmitCallDTO {
  @IsNumber()
  @Min(1)
  newRate: number; // New exchange rate (GALA per SOUL)
}

export class SetAdminWalletDto extends SubmitCallDTO {
  @IsString()
  newWallet: string; // New admin wallet address
}

export class SetPoolAddressDto extends SubmitCallDTO {
  @IsString()
  newPoolAddress: string; // New pool wallet address for 15% allocation
}

export class MintSoulDto extends SubmitCallDTO {
  @IsString()
  to: string; // Address to mint SOUL to

  @IsNumber()
  @Min(0.000001)
  amount: number; // Amount of SOUL to mint
}

export class PausePurchasesDto extends SubmitCallDTO {
  @IsBoolean()
  paused: boolean;
}

export class GetCurrentRateDto extends ChainCallDTO {
  // No fields needed - just returns current rate
}

export class GetAdminWalletDto extends ChainCallDTO {
  // No fields needed - just returns admin wallet
}

export class SetSoulTokenClassDto extends SubmitCallDTO {
  @IsString()
  soulTokenClassKey: string; // TokenClassKey query string (e.g., "category:collection:type")
}

