import {
  ConflictError,
  DefaultError,
  GalaChainResponse,
  NotFoundError,
  UnauthorizedError
} from "@gala-chain/api";
import {
  Evaluate,
  GalaChainContext,
  GalaContract,
  GalaTransaction,
  GalaTransactionType,
  Submit,
  getObjectByKey,
  putChainObject,
  resolveUserAlias
} from "@gala-chain/chaincode";
import BigNumber from "bignumber.js";

const version = "1.0.1";
import { EggNFT } from "./EggNFT";
import {
  BurnEggDto,
  FetchEggDto,
  FetchEggsByOwnerDto,
  HatchDto,
  MintByParentsDto,
  MintByUserDto,
  MultiMintDto,
  PauseDto,
  StartIncubationDto,
  TransferEggDto,
  UpdateSettingsDto
} from "./dto";
import { PaymentRecord } from "./payments";
import { EggSettings } from "./settings";
import {
  DEFAULT_HATCH_TIME_HOURS,
  Faction,
  MULTI_MINT_GALA_COST,
  Rarity,
  SINGLE_MINT_GALA_COST
} from "./types";
import { buildMetadata, pickFaction, pickRarity, pickSpecies, splitPayment } from "./utils";
import { sendWebhook } from "./webhook";

export class EggContract extends GalaContract {
  constructor() {
    super("EggContract", version);
  }

  @Submit({
    in: MintByUserDto,
    out: EggNFT
  })
  public async MintByUser(ctx: GalaChainContext, dto: MintByUserDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.assertGalaAmount(dto.galaAmount, SINGLE_MINT_GALA_COST);

    const egg = await this.mintEgg(ctx, {
      owner: dto.ownerAddress,
      faction: dto.faction,
      seed: dto.uniqueKey ?? ctx.stub.getTxID()
    });

    await this.recordPayment(ctx, dto.ownerAddress, dto.galaAmount, settings, egg.id, "MintByUser");
    this.emitEvent(ctx, "EggMinted", { id: egg.id, owner: egg.ownerAddress, faction: egg.faction, rarity: egg.rarity });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggMinted", {
      id: egg.id,
      owner: egg.ownerAddress,
      faction: egg.faction,
      rarity: egg.rarity,
      species: egg.species,
      galaAmount: dto.galaAmount
    });

    return egg;
  }

  @Submit({
    in: MultiMintDto,
    out: { arrayOf: EggNFT }
  })
  public async MultiMint(ctx: GalaChainContext, dto: MultiMintDto): Promise<EggNFT[]> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.assertGalaAmount(dto.galaAmount, MULTI_MINT_GALA_COST);

    const eggs: EggNFT[] = [];
    for (let i = 0; i < 4; i++) {
      const faction = pickFaction(`${dto.uniqueKey ?? ctx.stub.getTxID()}:${i}`);
      const egg = await this.mintEgg(ctx, {
        owner: dto.ownerAddress,
        faction,
        seed: `${dto.uniqueKey ?? ctx.stub.getTxID()}:${i}`
      });
      eggs.push(egg);
    }

    await this.recordPayment(
      ctx,
      dto.ownerAddress,
      dto.galaAmount,
      settings,
      dto.uniqueKey ?? ctx.stub.getTxID(),
      "MultiMint"
    );
    this.emitEvent(ctx, "EggBatchMinted", { count: eggs.length, owner: dto.ownerAddress, ids: eggs.map((e) => e.id) });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggBatchMinted", {
      count: eggs.length,
      owner: dto.ownerAddress,
      ids: eggs.map((e) => e.id),
      eggs: eggs.map((e) => ({
        id: e.id,
        faction: e.faction,
        rarity: e.rarity,
        species: e.species
      })),
      galaAmount: dto.galaAmount
    });

    return eggs;
  }

  @Submit({
    in: MintByParentsDto,
    out: EggNFT
  })
  public async MintByParents(ctx: GalaChainContext, dto: MintByParentsDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureAuthorizedContract(ctx, settings);
    this.ensureNotPaused(settings);

    const id = this.deriveEggId(ctx, dto.uniqueKey ?? ctx.stub.getTxID());
    const metadata = buildMetadata({ id, faction: dto.faction });
    const egg = await this.createAndPersistEgg(ctx, {
      id,
      owner: dto.ownerAddress,
      faction: dto.faction,
      species: dto.species,
      rarity: dto.rarity,
      metadata
    });

    this.emitEvent(ctx, "EggMintedByParents", {
      id: egg.id,
      owner: egg.ownerAddress,
      faction: egg.faction,
      rarity: egg.rarity,
      species: egg.species
    });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggMintedByParents", {
      id: egg.id,
      owner: egg.ownerAddress,
      faction: egg.faction,
      rarity: egg.rarity,
      species: egg.species
    });

    return egg;
  }

  @Submit({
    in: TransferEggDto,
    out: EggNFT
  })
  public async Transfer(ctx: GalaChainContext, dto: TransferEggDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    const egg = await this.getEggOrThrow(ctx, dto.id);
    
    // Prevent transfer if egg is incubating
    this.ensureNotIncubating(egg, "transfer");
    
    // Prevent transfer if egg has a future hatchReadyAt timestamp (indicates incubation in progress)
    if (egg.hatchReadyAt && egg.hatchReadyAt > ctx.txUnixTime) {
      throw new ConflictError("Cannot transfer egg that is incubating", { id: egg.id, hatchReadyAt: egg.hatchReadyAt });
    }
    
    // Prevent transfer if egg is already hatched
    if (egg.isHatched) {
      throw new ConflictError("Cannot transfer hatched egg", { id: egg.id });
    }
    
    // Prevent transfer if egg is owned by an authorized contract (likely in escrow)
    if (settings.authorizedContracts.includes(egg.ownerAddress)) {
      throw new ConflictError("Cannot transfer egg that is in contract escrow", { id: egg.id, owner: egg.ownerAddress });
    }
    
    this.ensureOwnerOrAdmin(ctx, settings, egg.ownerAddress);

    if (egg.ownerAddress !== dto.from) {
      throw new UnauthorizedError("Transfer requested by non-owner", { from: dto.from, owner: egg.ownerAddress });
    }

    egg.ownerAddress = dto.to;
    await putChainObject(ctx, egg);
    this.emitEvent(ctx, "EggTransferred", { id: egg.id, from: dto.from, to: dto.to });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggTransferred", {
      id: egg.id,
      from: dto.from,
      to: dto.to,
      faction: egg.faction,
      rarity: egg.rarity
    });

    return egg;
  }

  @Submit({
    in: BurnEggDto
  })
  public async BurnEgg(ctx: GalaChainContext, dto: BurnEggDto): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    const egg = await this.getEggOrThrow(ctx, dto.id);
    this.ensureNotIncubating(egg, "burn");
    
    // Prevent burn if egg is owned by an authorized contract (likely in escrow)
    if (settings.authorizedContracts.includes(egg.ownerAddress)) {
      throw new ConflictError("Cannot burn egg that is in contract escrow", { id: egg.id, owner: egg.ownerAddress });
    }
    
    this.ensureOwnerOrAdmin(ctx, settings, egg.ownerAddress);

    await ctx.stub.deleteState(egg.getCompositeKey());
    this.emitEvent(ctx, "EggBurned", { id: dto.id, owner: egg.ownerAddress });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggBurned", {
      id: dto.id,
      owner: egg.ownerAddress,
      faction: egg.faction,
      rarity: egg.rarity
    });

    return GalaChainResponse.Success(dto.id);
  }

  @Submit({
    in: StartIncubationDto
  })
  public async StartIncubation(ctx: GalaChainContext, dto: StartIncubationDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureAuthorizedContract(ctx, settings);
    this.ensureNotPaused(settings);

    const egg = await this.getEggOrThrow(ctx, dto.id);
    if (egg.isHatched) {
      throw new ConflictError("Egg already hatched", { id: egg.id });
    }

    egg.isIncubating = true;
    egg.hatchReadyAt = ctx.txUnixTime + egg.hatchTimeHours * 60 * 60 * 1000;
    await putChainObject(ctx, egg);
    this.emitEvent(ctx, "EggIncubationStarted", { id: egg.id, hatchReadyAt: egg.hatchReadyAt });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggIncubationStarted", {
      id: egg.id,
      owner: egg.ownerAddress,
      hatchReadyAt: egg.hatchReadyAt,
      hatchTimeHours: egg.hatchTimeHours,
      faction: egg.faction
    });

    return egg;
  }

  @Submit({
    in: HatchDto
  })
  public async Hatch(ctx: GalaChainContext, dto: HatchDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureAuthorizedContract(ctx, settings);
    this.ensureNotPaused(settings);

    const egg = await this.getEggOrThrow(ctx, dto.id);
    if (!egg.isIncubating) {
      throw new ConflictError("Egg is not incubating", { id: egg.id });
    }
    if (egg.isHatched) {
      throw new ConflictError("Egg already hatched", { id: egg.id });
    }
    if (egg.hatchReadyAt && egg.hatchReadyAt > ctx.txUnixTime) {
      throw new ConflictError("Egg is still incubating", { id: egg.id, readyAt: egg.hatchReadyAt, now: ctx.txUnixTime });
    }

    egg.isIncubating = false;
    egg.isHatched = true;
    await putChainObject(ctx, egg);
    this.emitEvent(ctx, "EggHatched", { id: egg.id, owner: egg.ownerAddress, rarity: egg.rarity, species: egg.species });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggHatched", {
      id: egg.id,
      owner: egg.ownerAddress,
      rarity: egg.rarity,
      species: egg.species,
      faction: egg.faction
    });

    return egg;
  }

  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: FetchEggDto,
    out: EggNFT
  })
  public async GetEgg(ctx: GalaChainContext, dto: FetchEggDto): Promise<EggNFT> {
    return this.getEggOrThrow(ctx, dto.id);
  }

  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: FetchEggsByOwnerDto,
    out: { arrayOf: EggNFT }
  })
  public async GetEggsByOwner(ctx: GalaChainContext, dto: FetchEggsByOwnerDto): Promise<EggNFT[]> {
    const owner = await resolveUserAlias(ctx, dto.owner);
    const iterator = ctx.stub.getStateByPartialCompositeKey(EggNFT.INDEX_KEY, []);
    const eggs: EggNFT[] = [];

    for await (const result of iterator) {
      if (result.value) {
        const egg = JSON.parse(result.value.toString()) as EggNFT;
        if (egg.ownerAddress !== owner) {
          continue;
        }
        if (dto.faction && egg.faction !== dto.faction) continue;
        if (dto.rarity && egg.rarity !== dto.rarity) continue;
        if (dto.isHatched !== undefined && egg.isHatched !== dto.isHatched) continue;
        if (dto.isIncubating !== undefined && egg.isIncubating !== dto.isIncubating) continue;
        eggs.push(egg as unknown as EggNFT);
      }
    }

    return eggs;
  }

  @Submit({
    in: PauseDto
  })
  public async Pause(ctx: GalaChainContext, dto: PauseDto): Promise<GalaChainResponse<boolean>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    settings.paused = dto.paused;
    await putChainObject(ctx, settings);
    this.emitEvent(ctx, "EggContractPaused", { paused: dto.paused, admin: ctx.callingUser });

    // Send webhook notification
    await sendWebhook(ctx, settings.webhookUrl, "EggContractPaused", {
      paused: dto.paused,
      admin: ctx.callingUser
    });

    return GalaChainResponse.Success(dto.paused);
  }

  @Submit({
    in: UpdateSettingsDto,
    out: EggSettings
  })
  public async UpdateSettings(ctx: GalaChainContext, dto: UpdateSettingsDto): Promise<EggSettings> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    settings.adminAddress = dto.adminAddress ?? settings.adminAddress;
    settings.poolAddress = dto.poolAddress ?? settings.poolAddress;
    settings.webhookUrl = dto.webhookUrl ?? settings.webhookUrl;
    settings.authorizedContracts = dto.authorizedContracts ?? settings.authorizedContracts;

    await putChainObject(ctx, settings);
    this.emitEvent(ctx, "EggSettingsUpdated", {
      admin: settings.adminAddress,
      poolAddress: settings.poolAddress,
      webhookUrl: settings.webhookUrl,
      authorizedContracts: settings.authorizedContracts
    });

    // Send webhook notification (use new webhookUrl if it was updated)
    await sendWebhook(ctx, settings.webhookUrl, "EggSettingsUpdated", {
      admin: settings.adminAddress,
      poolAddress: settings.poolAddress,
      webhookUrl: settings.webhookUrl,
      authorizedContracts: settings.authorizedContracts
    });

    return settings;
  }

  // Helpers

  private async mintEgg(
    ctx: GalaChainContext,
    params: { owner: string; faction: Faction; seed: string }
  ): Promise<EggNFT> {
    const species = pickSpecies(params.faction, `${params.seed}:species`);
    const rarity = pickRarity(`${params.seed}:rarity`);
    const id = this.deriveEggId(ctx, params.seed);
    const metadata = buildMetadata({ id, faction: params.faction, hatchTimeHours: DEFAULT_HATCH_TIME_HOURS });

    return this.createAndPersistEgg(ctx, {
      id,
      owner: params.owner,
      faction: params.faction,
      species,
      rarity,
      metadata
    });
  }

  private async createAndPersistEgg(
    ctx: GalaChainContext,
    params: {
      id: string;
      owner: string;
      faction: Faction;
      species: string;
      rarity: Rarity;
      metadata: ReturnType<typeof buildMetadata>;
    }
  ): Promise<EggNFT> {
    const key = ctx.stub.createCompositeKey(EggNFT.INDEX_KEY, [params.id]);
    const existing = await getObjectByKey(ctx, EggNFT, key).catch(() => undefined);
    if (existing) {
      throw new ConflictError("Egg already exists", { id: params.id });
    }

    const egg = new EggNFT({
      id: params.id,
      ownerAddress: params.owner,
      faction: params.faction,
      species: params.species,
      rarity: params.rarity,
      metadata: params.metadata
    });
    await putChainObject(ctx, egg);
    return egg;
  }

  private async recordPayment(
    ctx: GalaChainContext,
    payer: string,
    galaAmount: number,
    settings: EggSettings,
    refId: string,
    action: string
  ) {
    const { pool, toAdmin } = splitPayment(galaAmount);

    const record = new PaymentRecord({
      id: `${ctx.stub.getTxID()}:${refId}:${action}`,
      payer,
      galaAmount: new BigNumber(galaAmount),
      pooled: pool,
      sentToAdmin: toAdmin,
      adminAddress: settings.adminAddress,
      poolAddress: settings.poolAddress,
      createdAt: ctx.txUnixTime
    });

    await putChainObject(ctx, record);
    this.emitEvent(ctx, "GalaSplit", {
      pool: pool.toString(),
      toAdmin: toAdmin.toString(),
      admin: settings.adminAddress,
      poolAddress: settings.poolAddress,
      payer,
      refId,
      action
    });
  }

  private async loadSettings(ctx: GalaChainContext): Promise<EggSettings> {
    const key = ctx.stub.createCompositeKey(EggSettings.INDEX_KEY, ["settings"]);
    const existing = await getObjectByKey(ctx, EggSettings, key).catch(() => undefined);
    if (existing) {
      return existing;
    }

    const defaultSettings = new EggSettings({
      id: "settings",
      adminAddress: ctx.callingUser,
      poolAddress: "pool",
      authorizedContracts: []
    });
    await putChainObject(ctx, defaultSettings);
    return defaultSettings;
  }

  private ensureAdmin(ctx: GalaChainContext, settings: EggSettings) {
    if (ctx.callingUser !== settings.adminAddress) {
      throw new UnauthorizedError("Only admin can perform this action", {
        caller: ctx.callingUser,
        admin: settings.adminAddress
      });
    }
  }

  private ensureNotPaused(settings: EggSettings) {
    if (settings.paused) {
      throw new ConflictError("Contract is paused");
    }
  }

  private ensureAuthorizedContract(ctx: GalaChainContext, settings: EggSettings) {
    if (ctx.callingUser === settings.adminAddress) {
      return;
    }

    if (!settings.authorizedContracts.includes(ctx.callingUser)) {
      throw new UnauthorizedError("Caller not authorized for this contract-only method", {
        caller: ctx.callingUser
      });
    }
  }

  private ensureOwnerOrAdmin(ctx: GalaChainContext, settings: EggSettings, owner: string) {
    if (ctx.callingUser === owner || ctx.callingUser === settings.adminAddress) {
      return;
    }
    throw new UnauthorizedError("Caller must be owner or admin", { caller: ctx.callingUser, owner });
  }

  private ensureNotIncubating(egg: EggNFT, action: string) {
    if (egg.isIncubating) {
      throw new ConflictError(`Cannot ${action} incubating egg`, { id: egg.id });
    }
  }

  private async getEggOrThrow(ctx: GalaChainContext, id: string): Promise<EggNFT> {
    const key = ctx.stub.createCompositeKey(EggNFT.INDEX_KEY, [id]);
    const egg = await getObjectByKey(ctx, EggNFT, key).catch(() => undefined);
    if (!egg) {
      throw new NotFoundError("Egg not found", { id });
    }
    return egg;
  }

  private assertGalaAmount(galaAmount: number, expected: number) {
    if (galaAmount < expected) {
      throw new DefaultError("Insufficient GALA sent for mint", { galaAmount, required: expected });
    }
    if (galaAmount > expected) {
      throw new DefaultError("Excess GALA sent. Exact amount required", { galaAmount, required: expected });
    }
  }

  private deriveEggId(ctx: GalaChainContext, seed: string): string {
    return `${ctx.stub.getTxID()}:${seed}`;
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

