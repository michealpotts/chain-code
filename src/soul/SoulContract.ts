import {
  ConflictError,
  DefaultError,
  GalaChainResponse,
  NotFoundError,
  TokenClassKey,
  TokenInstanceKey,
  UnauthorizedError,
} from "@gala-chain/api";
import {
  GalaChainContext,
  GalaContract,
  GalaTransaction,
  GalaTransactionType,
  Submit,
  getObjectByKey,
  mintToken,
  putChainObject,
  resolveUserAlias,
  transferToken,
} from "@gala-chain/chaincode";
import BigNumber from "bignumber.js";
import { plainToClass } from "class-transformer";

const version = "1.0.1";
import {
  BuySoulWithGalaDto,
  GetSoulAmountDto,
  GetCurrentRateDto,
  GetAdminWalletDto,
  MintSoulDto,
  PausePurchasesDto,
  SetAdminWalletDto,
  SetExchangeRateDto,
  SetSoulTokenClassDto,
  SetPoolAddressDto,
} from "./dto";
import { SoulSettings } from "./settings";

const POOL_PERCENTAGE = 0.15; // 15%
const ADMIN_PERCENTAGE = 0.85; // 85%

export class SoulContract extends GalaContract {
  constructor() {
    super("SoulContract", version);
  }

  /**
   * User purchases SOUL tokens with GALA tokens
   * Formula: SOUL_Amount = GALA_Paid / Current_Exchange_Rate
   * Fee Distribution: 15% pool, 85% admin
   */
  @Submit({
    in: BuySoulWithGalaDto,
  })
  public async BuySoulWithGala(
    ctx: GalaChainContext,
    dto: BuySoulWithGalaDto
  ): Promise<GalaChainResponse<{ soulAmount: number; galaPooled: number; galaToAdmin: number }>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.ensureSoulTokenClassConfigured(settings);

    // Calculate SOUL amount based on exchange rate
    const soulAmount = this.calculateSoulAmount(dto.galaAmount, settings.exchangeRate);
    if (soulAmount <= 0) {
      throw new DefaultError("Insufficient GALA amount", {
        galaAmount: dto.galaAmount,
        exchangeRate: settings.exchangeRate,
      });
    }

    // Calculate fee distribution
    const { pool, toAdmin } = this.splitGalaFees(dto.galaAmount);

    // Parse GALA token instance key from query string
    // Format: "category:collection:type:instance" or object
    const galaTokenInstance = this.parseTokenInstanceKey(dto.galaTokenInstance);
    const galaAmountBN = new BigNumber(dto.galaAmount);

    // Transfer GALA from buyer to contract (temporary - we'll redistribute)
    // Note: In GalaChain, we need to transfer to addresses, so we'll transfer directly
    // to pool address and admin wallet instead of through contract
    const buyerAddress = await resolveUserAlias(ctx, dto.buyerAddress);

    // Transfer 15% to pool address
    const poolAmountBN = pool;
    if (poolAmountBN.gt(0)) {
      await transferToken(ctx, {
        from: buyerAddress,
        to: await resolveUserAlias(ctx, settings.poolAddress),
        tokenInstanceKey: galaTokenInstance,
        quantity: poolAmountBN,
        allowancesToUse: [],
        authorizedOnBehalf: undefined,
      });
    }

    // Transfer 85% to admin wallet
    const adminAmountBN = toAdmin;
    if (adminAmountBN.gt(0)) {
      await transferToken(ctx, {
        from: buyerAddress,
        to: await resolveUserAlias(ctx, settings.adminWallet),
        tokenInstanceKey: galaTokenInstance,
        quantity: adminAmountBN,
        allowancesToUse: [],
        authorizedOnBehalf: undefined,
      });
    }

    // Mint SOUL tokens to buyer
    if (!settings.soulTokenClassKey) {
      throw new NotFoundError("SOUL token class not configured");
    }
    const soulTokenClassKey = this.parseTokenClassKey(settings.soulTokenClassKey);

    await mintToken(ctx, {
      owner: buyerAddress,
      tokenClassKey: soulTokenClassKey,
      quantity: new BigNumber(soulAmount),
      authorizedOnBehalf: undefined,
    });

    // Update statistics
    await this.updateStatistics(ctx, settings, dto.galaAmount, poolAmountBN.toNumber(), adminAmountBN.toNumber());

    // Emit event
    this.emitEvent(ctx, "SoulPurchased", {
      buyer: dto.buyerAddress,
      galaAmount: dto.galaAmount,
      soulAmount,
      exchangeRate: settings.exchangeRate,
      galaPooled: poolAmountBN.toNumber(),
      galaToAdmin: adminAmountBN.toNumber(),
    });

    return GalaChainResponse.Success({
      soulAmount,
      galaPooled: poolAmountBN.toNumber(),
      galaToAdmin: adminAmountBN.toNumber(),
    });
  }

  /**
   * View function: Calculate how much SOUL user would get for given GALA amount
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetSoulAmountDto,
  })
  public async GetSoulAmount(ctx: GalaChainContext, dto: GetSoulAmountDto): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    const soulAmount = this.calculateSoulAmount(dto.galaAmount, settings.exchangeRate);
    return GalaChainResponse.Success(soulAmount);
  }

  /**
   * Admin: Set exchange rate (GALA per SOUL)
   */
  @Submit({
    in: SetExchangeRateDto,
  })
  public async SetExchangeRate(ctx: GalaChainContext, dto: SetExchangeRateDto): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    const oldRate = settings.exchangeRate;
    settings.exchangeRate = dto.newRate;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "ExchangeRateUpdated", {
      oldRate,
      newRate: dto.newRate,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.newRate);
  }

  /**
   * Admin: Set SOUL token class key (must be called after creating SOUL token class)
   */
  @Submit({
    in: SetSoulTokenClassDto,
  })
  public async SetSoulTokenClass(
    ctx: GalaChainContext,
    dto: SetSoulTokenClassDto
  ): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    // Validate the token class key format by parsing it
    try {
      this.parseTokenClassKey(dto.soulTokenClassKey);
    } catch (error) {
      throw new DefaultError("Invalid SOUL token class key format", {
        key: dto.soulTokenClassKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    settings.soulTokenClassKey = dto.soulTokenClassKey;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "SoulTokenClassSet", {
      tokenClassKey: dto.soulTokenClassKey,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.soulTokenClassKey);
  }

  /**
   * Admin: Set admin wallet address
   */
  @Submit({
    in: SetAdminWalletDto,
  })
  public async SetAdminWallet(
    ctx: GalaChainContext,
    dto: SetAdminWalletDto
  ): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    const oldWallet = settings.adminWallet;
    settings.adminWallet = dto.newWallet;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "AdminWalletUpdated", {
      oldWallet,
      newWallet: dto.newWallet,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.newWallet);
  }

  /**
   * Admin: Set pool wallet address for 15% allocation
   */
  @Submit({
    in: SetPoolAddressDto,
  })
  public async SetPoolAddress(ctx: GalaChainContext, dto: SetPoolAddressDto): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    const oldPool = settings.poolAddress;
    settings.poolAddress = dto.newPoolAddress;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "PoolAddressUpdated", {
      oldPool,
      newPool: dto.newPoolAddress,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.newPoolAddress);
  }

  /**
   * Admin: Directly mint SOUL tokens (for rewards, airdrops, etc.)
   */
  @Submit({
    in: MintSoulDto,
  })
  public async MintSoul(ctx: GalaChainContext, dto: MintSoulDto): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);
    this.ensureSoulTokenClassConfigured(settings);

    const recipientAddress = await resolveUserAlias(ctx, dto.to);
    if (!settings.soulTokenClassKey) {
      throw new NotFoundError("SOUL token class not configured");
    }
    const soulTokenClassKey = this.parseTokenClassKey(settings.soulTokenClassKey);

    await mintToken(ctx, {
      owner: recipientAddress,
      tokenClassKey: soulTokenClassKey,
      quantity: new BigNumber(dto.amount),
      authorizedOnBehalf: undefined,
    });

    this.emitEvent(ctx, "SoulMinted", {
      to: dto.to,
      amount: dto.amount,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.amount);
  }

  /**
   * Admin: Pause/resume purchases
   */
  @Submit({
    in: PausePurchasesDto,
  })
  public async PausePurchases(
    ctx: GalaChainContext,
    dto: PausePurchasesDto
  ): Promise<GalaChainResponse<boolean>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    settings.purchasesPaused = dto.paused;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "PurchasesPaused", {
      paused: dto.paused,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.paused);
  }

  /**
   * View: Get current exchange rate
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetCurrentRateDto,
  })
  public async GetCurrentRate(ctx: GalaChainContext, dto: GetCurrentRateDto): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    return GalaChainResponse.Success(settings.exchangeRate);
  }

  /**
   * View: Get admin wallet address
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetAdminWalletDto,
  })
  public async GetAdminWallet(
    ctx: GalaChainContext,
    dto: GetAdminWalletDto
  ): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    return GalaChainResponse.Success(settings.adminWallet);
  }

  /**
   * View: Get total GALA pooled
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetCurrentRateDto, // Reusing DTO for simplicity
  })
  public async TotalGalaPooled(ctx: GalaChainContext, dto: GetCurrentRateDto): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    return GalaChainResponse.Success(settings.totalGalaPooled ?? 0);
  }

  /**
   * View: Get total GALA collected by admin
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetCurrentRateDto, // Reusing DTO for simplicity
  })
  public async TotalGalaCollected(
    ctx: GalaChainContext,
    dto: GetCurrentRateDto
  ): Promise<GalaChainResponse<number>> {
    const settings = await this.loadSettings(ctx);
    return GalaChainResponse.Success(settings.totalGalaCollected ?? 0);
  }

  // Private helper methods

  private calculateSoulAmount(galaAmount: number, exchangeRate: number): number {
    return galaAmount / exchangeRate;
  }

  private splitGalaFees(total: number): { pool: BigNumber; toAdmin: BigNumber } {
    const pool = new BigNumber(total).multipliedBy(POOL_PERCENTAGE);
    const toAdmin = new BigNumber(total).multipliedBy(ADMIN_PERCENTAGE);
    return { pool, toAdmin };
  }

  private async loadSettings(ctx: GalaChainContext): Promise<SoulSettings> {
    const key = ctx.stub.createCompositeKey(SoulSettings.INDEX_KEY, ["settings"]);
    const existing = await getObjectByKey(ctx, SoulSettings, key).catch(() => undefined);
    if (existing) {
      return existing;
    }

    // Create default settings
    const defaultSettings = new SoulSettings({
      id: "settings",
      adminAddress: ctx.callingUser,
      adminWallet: ctx.callingUser,
      poolAddress: "pool",
      exchangeRate: 100, // 1 SOUL = 100 GALA
    });
    await putChainObject(ctx, defaultSettings);
    return defaultSettings;
  }

  private ensureAdmin(ctx: GalaChainContext, settings: SoulSettings) {
    if (ctx.callingUser !== settings.adminAddress) {
      throw new UnauthorizedError("Only admin can perform this action", {
        caller: ctx.callingUser,
        admin: settings.adminAddress,
      });
    }
  }

  private ensureNotPaused(settings: SoulSettings) {
    if (settings.purchasesPaused) {
      throw new ConflictError("Soul purchases are currently paused");
    }
  }

  private ensureSoulTokenClassConfigured(settings: SoulSettings) {
    if (!settings.soulTokenClassKey) {
      throw new NotFoundError("SOUL token class not configured. Admin must set soulTokenClassKey in settings.");
    }
  }

  private async updateStatistics(
    ctx: GalaChainContext,
    settings: SoulSettings,
    totalGala: number,
    pooled: number,
    collected: number
  ) {
    settings.totalGalaPooled = (settings.totalGalaPooled ?? 0) + pooled;
    settings.totalGalaCollected = (settings.totalGalaCollected ?? 0) + collected;
    await putChainObject(ctx, settings);
  }

  private parseTokenInstanceKey(queryString: string): TokenInstanceKey {
    // Try to parse as JSON first, then fall back to query string parsing
    try {
      const parsed = JSON.parse(queryString);
      return plainToClass(TokenInstanceKey, parsed);
    } catch {
      // Parse query string format: "category:collection:type:instance"
      const parts = queryString.split(":");
      if (parts.length < 4) {
        throw new DefaultError("Invalid token instance key format", { queryString });
      }
      return plainToClass(TokenInstanceKey, {
        category: parts[0],
        collection: parts[1],
        type: parts[2],
        instance: parts[3],
        additionalKey: parts[4] || undefined,
      });
    }
  }

  private parseTokenClassKey(queryString: string): TokenClassKey {
    // Try to parse as JSON first, then fall back to query string parsing
    try {
      const parsed = JSON.parse(queryString);
      return plainToClass(TokenClassKey, parsed);
    } catch {
      // Parse query string format: "category:collection:type"
      const parts = queryString.split(":");
      if (parts.length < 3) {
        throw new DefaultError("Invalid token class key format", { queryString });
      }
      return plainToClass(TokenClassKey, {
        category: parts[0],
        collection: parts[1],
        type: parts[2],
        additionalKey: parts[3] || undefined,
      });
    }
  }

  private emitEvent(ctx: GalaChainContext, name: string, payload: unknown) {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      ctx.stub.setEvent(name, encoded);
    } catch (err) {
      // events are best-effort; do not fail the tx
    }
  }
}

