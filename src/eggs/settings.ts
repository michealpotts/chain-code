import { ChainKey, ChainObject } from "@gala-chain/api";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class EggSettings extends ChainObject {
  static INDEX_KEY = "GCEGGCFG";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public adminAddress: string;

  @IsString()
  public poolAddress: string;

  @IsBoolean()
  public paused: boolean;

  @IsOptional()
  @IsString()
  public webhookUrl?: string;

  @IsArray()
  @IsString({ each: true })
  public authorizedContracts: string[];

  constructor(params: {
    id?: string;
    adminAddress: string;
    poolAddress: string;
    paused?: boolean;
    webhookUrl?: string;
    authorizedContracts?: string[];
  }) {
    super();
    this.id = params.id ?? "settings";
    this.adminAddress = params.adminAddress;
    this.poolAddress = params.poolAddress;
    this.paused = params.paused ?? false;
    this.webhookUrl = params.webhookUrl;
    this.authorizedContracts = params.authorizedContracts ?? [];
  }
}

