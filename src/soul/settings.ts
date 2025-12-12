import { ChainKey, ChainObject } from "@gala-chain/api";
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SoulSettings extends ChainObject {
  static INDEX_KEY = "GCSOULCFG";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public adminAddress: string;

  @IsString()
  public adminWallet: string; // Wallet that receives 85% of GALA

  @IsString()
  public poolAddress: string; // Address for storing 15% of GALA

  @IsNumber()
  @Min(1)
  public exchangeRate: number; // GALA per SOUL (e.g., 100 = 1 SOUL costs 100 GALA)

  @IsBoolean()
  public purchasesPaused: boolean;

  @IsOptional()
  @IsString()
  public webhookUrl?: string;

  @IsOptional()
  @IsString()
  public soulTokenClassKey?: string; // JSON string of TokenClassKey for SOUL token

  @IsOptional()
  @IsNumber()
  public totalGalaPooled?: number; // Total GALA pooled (15% of all purchases)

  @IsOptional()
  @IsNumber()
  public totalGalaCollected?: number; // Total GALA collected by admin (85% of all purchases)

  constructor(params: {
    id?: string;
    adminAddress: string;
    adminWallet: string;
    poolAddress: string;
    exchangeRate?: number;
    purchasesPaused?: boolean;
    webhookUrl?: string;
    soulTokenClassKey?: string;
    totalGalaPooled?: number;
    totalGalaCollected?: number;
  }) {
    super();
    this.id = params.id ?? "settings";
    this.adminAddress = params.adminAddress;
    this.adminWallet = params.adminWallet;
    this.poolAddress = params.poolAddress;
    this.exchangeRate = params.exchangeRate ?? 100; // Default: 1 SOUL = 100 GALA
    this.purchasesPaused = params.purchasesPaused ?? false;
    this.webhookUrl = params.webhookUrl;
    this.soulTokenClassKey = params.soulTokenClassKey;
    this.totalGalaPooled = params.totalGalaPooled ?? 0;
    this.totalGalaCollected = params.totalGalaCollected ?? 0;
  }
}

