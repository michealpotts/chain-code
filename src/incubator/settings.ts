import { ChainKey, ChainObject } from "@gala-chain/api";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class IncubatorSettings extends ChainObject {
  static INDEX_KEY = "GCINCCFG";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public adminAddress: string;

  @IsString()
  public adminWallet: string; // Wallet that receives 85% of GALA from speed-ups

  @IsString()
  public poolAddress: string; // Address for storing 15% of GALA

  @IsString()
  public contractAddress: string; // Incubator contract address (for egg escrow)

  @IsOptional()
  @IsString()
  public creatureTokenClassKey?: string; // TokenClassKey for creature NFTs

  @IsBoolean()
  public paused: boolean;

  @IsOptional()
  @IsString()
  public webhookUrl?: string;

  @IsOptional()
  @IsNumber()
  public totalGalaPooled?: number;

  @IsOptional()
  @IsNumber()
  public totalGalaCollected?: number;

  constructor(params: {
    id?: string;
    adminAddress: string;
    adminWallet: string;
    poolAddress: string;
    contractAddress: string;
    creatureTokenClassKey?: string;
    paused?: boolean;
    webhookUrl?: string;
    totalGalaPooled?: number;
    totalGalaCollected?: number;
  }) {
    super();
    this.id = params.id ?? "settings";
    this.adminAddress = params.adminAddress;
    this.adminWallet = params.adminWallet;
    this.poolAddress = params.poolAddress;
    this.contractAddress = params.contractAddress;
    this.creatureTokenClassKey = params.creatureTokenClassKey;
    this.paused = params.paused ?? false;
    this.webhookUrl = params.webhookUrl;
    this.totalGalaPooled = params.totalGalaPooled ?? 0;
    this.totalGalaCollected = params.totalGalaCollected ?? 0;
  }
}

