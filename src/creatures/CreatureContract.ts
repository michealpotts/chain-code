import {
  ConflictError,
  DefaultError,
  GalaChainResponse,
  NotFoundError,
  TokenInstanceKey,
  UnauthorizedError
} from "@gala-chain/api";
import {
  GalaChainContext,
  GalaContract,
  GalaTransaction,
  GalaTransactionType,
  Submit,
  getObjectByKey,
  putChainObject,
  resolveUserAlias,
  transferToken
} from "@gala-chain/chaincode";
import BigNumber from "bignumber.js";
import { plainToClass } from "class-transformer";

import { EggNFT } from "../eggs/EggNFT";
import { Faction, Rarity } from "../eggs/types";
import { buildMetadata as buildEggMetadata, deterministicRandom } from "../eggs/utils";
import { BurnCreatureDto, EvolveDto, FetchCreatureDto, FetchCreaturesByOwnerDto, MintBabyDto, MintEggFromCreaturesDto, TransferCreatureDto, UpdateCreatureSettingsDto } from "./dto";
import { CreatureNFT } from "./CreatureNFT";
import { CreatureSettings } from "./settings";
import {
  BABY_GALA_COST,
  BABY_SOUL_COST,
  BURN_PERCENTAGE,
  CREATURE_RARITY_ORDER,
  CreatureMetadata,
  Generation
} from "./types";

const version = "0.1.0";

export class CreatureContract extends GalaContract {
  constructor() {
    super("CreatureContract", version);
  }

  @Submit({
    in: MintBabyDto,
    out: CreatureNFT
  })
  public async MintBaby(ctx: GalaChainContext, dto: MintBabyDto): Promise<CreatureNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    this.assertCosts(dto.galaAmount, dto.soulAmount, settings.babyGalaCost, settings.babySoulCost, "mint baby");

    const owner = await resolveUserAlias(ctx, dto.ownerAddress);
    const egg = await this.getEggOrThrow(ctx, dto.eggId);

    if (!egg.isHatched) {
      throw new ConflictError("Egg must be hatched before minting a creature", { eggId: dto.eggId });
    }
    if (egg.ownerAddress !== owner) {
      throw new UnauthorizedError("Caller does not own the egg", { eggOwner: egg.ownerAddress, caller: owner });
    }

    await this.collectPayments(
      ctx,
      owner,
      dto.galaAmount,
      dto.soulAmount,
      dto.galaTokenInstance,
      dto.soulTokenInstance,
      settings,
      dto.eggId,
      "MintBaby"
    );

    const creature = await this.createCreature(ctx, {
      owner,
      faction: egg.faction,
      species: egg.species,
      rarity: egg.rarity,
      generation: Generation.BABY
    });

    await ctx.stub.deleteState(egg.getCompositeKey());
    this.emitEvent(ctx, "CreatureMinted", {
      id: creature.id,
      owner: creature.ownerAddress,
      faction: creature.faction,
      rarity: creature.rarity,
      species: creature.species,
      generation: creature.generation,
      eggId: dto.eggId
    });

    return creature;
  }

  @Submit({
    in: EvolveDto,
    out: CreatureNFT
  })
  public async Evolve(ctx: GalaChainContext, dto: EvolveDto): Promise<CreatureNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.assertCosts(dto.galaAmount, dto.soulAmount, settings.evolveGalaCost, settings.evolveSoulCost, "evolve");

    const owner = await resolveUserAlias(ctx, dto.ownerAddress);
    if (dto.parentCreatureIdA === dto.parentCreatureIdB) {
      throw new DefaultError("Parent creatures must be distinct", { parent: dto.parentCreatureIdA });
    }

    const parentA = await this.getCreatureOrThrow(ctx, dto.parentCreatureIdA);
    const parentB = await this.getCreatureOrThrow(ctx, dto.parentCreatureIdB);

    this.ensureOwner(owner, parentA);
    this.ensureOwner(owner, parentB);

    if (parentA.faction !== parentB.faction) {
      throw new ConflictError("Parents must share the same faction", { factionA: parentA.faction, factionB: parentB.faction });
    }
    if (parentA.generation !== parentB.generation) {
      throw new ConflictError("Parents must share the same generation", {
        generationA: parentA.generation,
        generationB: parentB.generation
      });
    }

    const nextGeneration = this.nextGeneration(parentA.generation);
    if (!nextGeneration) {
      throw new ConflictError("Parents are already at max generation", { generation: parentA.generation });
    }

    await this.collectPayments(
      ctx,
      owner,
      dto.galaAmount,
      dto.soulAmount,
      dto.galaTokenInstance,
      dto.soulTokenInstance,
      settings,
      `${dto.parentCreatureIdA}:${dto.parentCreatureIdB}`,
      "Evolve"
    );

    const child = await this.createCreature(ctx, {
      owner,
      faction: parentA.faction,
      species: this.pickSpeciesFromParents(parentA.species, parentB.species, `${ctx.stub.getTxID()}:species`),
      rarity: this.pickRarityFromParents(parentA.rarity, parentB.rarity, `${ctx.stub.getTxID()}:rarity`),
      generation: nextGeneration
    });

    await ctx.stub.deleteState(parentA.getCompositeKey());
    await ctx.stub.deleteState(parentB.getCompositeKey());

    this.emitEvent(ctx, "CreatureEvolved", {
      id: child.id,
      owner: child.ownerAddress,
      parents: [parentA.id, parentB.id],
      faction: child.faction,
      rarity: child.rarity,
      species: child.species,
      generation: child.generation
    });

    return child;
  }

  @Submit({
    in: MintEggFromCreaturesDto,
    out: EggNFT
  })
  public async MintEggFromCreatures(ctx: GalaChainContext, dto: MintEggFromCreaturesDto): Promise<EggNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.assertCosts(dto.galaAmount, dto.soulAmount, settings.mintEggGalaCost, settings.mintEggSoulCost, "mint egg");

    const owner = await resolveUserAlias(ctx, dto.ownerAddress);
    const parentA = await this.getCreatureOrThrow(ctx, dto.parentCreatureIdA);
    const parentB = await this.getCreatureOrThrow(ctx, dto.parentCreatureIdB);

    this.ensureOwner(owner, parentA);
    this.ensureOwner(owner, parentB);

    if (parentA.faction !== parentB.faction) {
      throw new ConflictError("Parents must share the same faction", { factionA: parentA.faction, factionB: parentB.faction });
    }
    if (parentA.generation !== Generation.ADULT || parentB.generation !== Generation.ADULT) {
      throw new ConflictError("Only adult creatures can mint eggs");
    }

    await this.collectPayments(
      ctx,
      owner,
      dto.galaAmount,
      dto.soulAmount,
      dto.galaTokenInstance,
      dto.soulTokenInstance,
      settings,
      `${dto.parentCreatureIdA}:${dto.parentCreatureIdB}`,
      "MintEggFromCreatures"
    );

    const id = this.deriveId(ctx, `${dto.parentCreatureIdA}:${dto.parentCreatureIdB}`);
    const faction = parentA.faction;
    const species = this.pickSpeciesFromParents(parentA.species, parentB.species, `${ctx.stub.getTxID()}:egg:species`);
    const rarity = this.pickRarityFromParents(parentA.rarity, parentB.rarity, `${ctx.stub.getTxID()}:egg:rarity`);
    const metadata = buildEggMetadata({ id, faction });

    const egg = new EggNFT({
      id,
      ownerAddress: owner,
      faction,
      species,
      rarity,
      metadata
    });
    await putChainObject(ctx, egg);

    this.emitEvent(ctx, "EggMintedFromCreatures", {
      id: egg.id,
      owner: egg.ownerAddress,
      parents: [parentA.id, parentB.id],
      faction: egg.faction,
      rarity: egg.rarity,
      species: egg.species
    });

    return egg;
  }

  @Submit({
    in: TransferCreatureDto,
    out: CreatureNFT
  })
  public async Transfer(ctx: GalaChainContext, dto: TransferCreatureDto): Promise<CreatureNFT> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    const creature = await this.getCreatureOrThrow(ctx, dto.id);
    this.ensureOwnerOrAdmin(ctx, settings, creature.ownerAddress);

    if (creature.ownerAddress !== dto.from) {
      throw new UnauthorizedError("Transfer requested by non-owner", { from: dto.from, owner: creature.ownerAddress });
    }

    creature.ownerAddress = dto.to;
    await putChainObject(ctx, creature);

    this.emitEvent(ctx, "CreatureTransferred", { id: creature.id, from: dto.from, to: dto.to });
    return creature;
  }

  @Submit({
    in: BurnCreatureDto
  })
  public async BurnCreature(ctx: GalaChainContext, dto: BurnCreatureDto): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    const creature = await this.getCreatureOrThrow(ctx, dto.creatureId);
    this.ensureOwnerOrAdmin(ctx, settings, creature.ownerAddress);

    if (creature.ownerAddress !== dto.ownerId) {
      throw new UnauthorizedError("Burn requested by non-owner", { owner: creature.ownerAddress, caller: dto.ownerId });
    }

    await ctx.stub.deleteState(creature.getCompositeKey());
    this.emitEvent(ctx, "CreatureBurned", { id: creature.id, owner: creature.ownerAddress });

    return GalaChainResponse.Success(dto.creatureId);
  }

  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: FetchCreatureDto,
    out: CreatureNFT
  })
  public async GetCreature(ctx: GalaChainContext, dto: FetchCreatureDto): Promise<CreatureNFT> {
    return this.getCreatureOrThrow(ctx, dto.id);
  }

  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: FetchCreaturesByOwnerDto,
    out: { arrayOf: CreatureNFT }
  })
  public async GetCreaturesByOwner(ctx: GalaChainContext, dto: FetchCreaturesByOwnerDto): Promise<CreatureNFT[]> {
    const owner = await resolveUserAlias(ctx, dto.owner);
    const iterator = ctx.stub.getStateByPartialCompositeKey(CreatureNFT.INDEX_KEY, []);
    const creatures: CreatureNFT[] = [];

    for await (const result of iterator) {
      if (result.value) {
        const creature = JSON.parse(result.value.toString()) as CreatureNFT;
        if (creature.ownerAddress !== owner) {
          continue;
        }
        if (dto.generation && creature.generation !== dto.generation) continue;
        if (dto.faction && creature.faction !== dto.faction) continue;
        if (dto.rarity && creature.rarity !== dto.rarity) continue;
        creatures.push(creature as unknown as CreatureNFT);
      }
    }

    return creatures;
  }

  @Submit({
    in: UpdateCreatureSettingsDto,
    out: CreatureSettings
  })
  public async UpdateSettings(ctx: GalaChainContext, dto: UpdateCreatureSettingsDto): Promise<CreatureSettings> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    settings.adminAddress = dto.adminAddress ?? settings.adminAddress;
    settings.adminWallet = dto.adminWallet ?? settings.adminWallet;
    settings.burnAddress = dto.burnAddress ?? settings.burnAddress;
    settings.paused = dto.paused ?? settings.paused;
    settings.authorizedContracts = dto.authorizedContracts ?? settings.authorizedContracts;
    settings.babyGalaCost = dto.babyGalaCost ?? settings.babyGalaCost;
    settings.babySoulCost = dto.babySoulCost ?? settings.babySoulCost;
    settings.evolveGalaCost = dto.evolveGalaCost ?? settings.evolveGalaCost;
    settings.evolveSoulCost = dto.evolveSoulCost ?? settings.evolveSoulCost;
    settings.mintEggGalaCost = dto.mintEggGalaCost ?? settings.mintEggGalaCost;
    settings.mintEggSoulCost = dto.mintEggSoulCost ?? settings.mintEggSoulCost;

    await putChainObject(ctx, settings);
    this.emitEvent(ctx, "CreatureSettingsUpdated", {
      admin: settings.adminAddress,
      adminWallet: settings.adminWallet,
      burnAddress: settings.burnAddress,
      paused: settings.paused
    });

    return settings;
  }

  // Helpers

  private async createCreature(ctx: GalaChainContext, params: {
    owner: string;
    faction: Faction;
    species: string;
    rarity: Rarity;
    generation: Generation;
  }): Promise<CreatureNFT> {
    const id = this.deriveId(ctx, params.owner);
    const metadata = this.buildCreatureMetadata({
      id,
      faction: params.faction,
      species: params.species,
      rarity: params.rarity,
      generation: params.generation,
      createdAt: ctx.txUnixTime
    });

    const creature = new CreatureNFT({
      id,
      ownerAddress: params.owner,
      faction: params.faction,
      species: params.species,
      rarity: params.rarity,
      generation: params.generation,
      createdAt: ctx.txUnixTime,
      metadata
    });

    await putChainObject(ctx, creature);
    return creature;
  }

  private buildCreatureMetadata(params: {
    id: string;
    faction: Faction;
    species: string;
    rarity: Rarity;
    generation: Generation;
    createdAt: number;
  }): CreatureMetadata {
    const meta = new CreatureMetadata();
    meta.id = params.id;
    meta.type = "creature";
    meta.faction = params.faction;
    meta.species = params.species;
    meta.rarity = params.rarity;
    meta.generation = params.generation;
    meta.created_at = params.createdAt;
    meta.attributes = [
      { trait_type: "Category", value: "Creature" },
      { trait_type: "Faction", value: params.faction },
      { trait_type: "Species", value: params.species },
      { trait_type: "Rarity", value: params.rarity },
      { trait_type: "Generation", value: params.generation }
    ];
    return meta;
  }

  private pickSpeciesFromParents(speciesA: string, speciesB: string, seed: string): string {
    const roll = deterministicRandom(seed);
    return roll < 0.5 ? speciesA : speciesB;
  }

  private pickRarityFromParents(rarityA: Rarity, rarityB: Rarity, seed: string): Rarity {
    if (rarityA === rarityB) {
      const roll = deterministicRandom(seed, 10);
      if (roll <= 0.8) return rarityA;
      if (roll <= 0.95) return this.shiftRarity(rarityA, -1);
      return this.shiftRarity(rarityA, 1);
    }

    const idxA = CREATURE_RARITY_ORDER.indexOf(rarityA);
    const idxB = CREATURE_RARITY_ORDER.indexOf(rarityB);
    const higher = Math.max(idxA, idxB);
    const lower = Math.min(idxA, idxB);
    const range = higher - lower || 1;
    const roll = deterministicRandom(seed, 10);

    // Weighted-average style: closer to the middle, bias slightly toward the higher rarity
    const threshold = (range === 0 ? 0.5 : (higher + lower) / (2 * higher + 1));
    if (roll >= threshold) {
      return CREATURE_RARITY_ORDER[higher];
    }
    return CREATURE_RARITY_ORDER[lower];
  }

  private shiftRarity(rarity: Rarity, delta: number): Rarity {
    const idx = CREATURE_RARITY_ORDER.indexOf(rarity);
    const next = Math.max(0, Math.min(CREATURE_RARITY_ORDER.length - 1, idx + delta));
    return CREATURE_RARITY_ORDER[next];
  }

  private nextGeneration(current: Generation): Generation | null {
    if (current === Generation.BABY) return Generation.YOUNG;
    if (current === Generation.YOUNG) return Generation.ADULT;
    return null;
  }

  private async getCreatureOrThrow(ctx: GalaChainContext, id: string): Promise<CreatureNFT> {
    const key = ctx.stub.createCompositeKey(CreatureNFT.INDEX_KEY, [id]);
    const creature = await getObjectByKey(ctx, CreatureNFT, key).catch(() => undefined);
    if (!creature) {
      throw new NotFoundError("Creature not found", { id });
    }
    return creature;
  }

  private async getEggOrThrow(ctx: GalaChainContext, id: string): Promise<EggNFT> {
    const key = ctx.stub.createCompositeKey(EggNFT.INDEX_KEY, [id]);
    const egg = await getObjectByKey(ctx, EggNFT, key).catch(() => undefined);
    if (!egg) {
      throw new NotFoundError("Egg not found", { id });
    }
    return egg;
  }

  private ensureOwner(owner: string, creature: CreatureNFT) {
    if (creature.ownerAddress !== owner) {
      throw new UnauthorizedError("Caller does not own the creature", { owner: creature.ownerAddress, caller: owner });
    }
  }

  private ensureOwnerOrAdmin(ctx: GalaChainContext, settings: CreatureSettings, owner: string) {
    if (ctx.callingUser === owner || ctx.callingUser === settings.adminAddress) {
      return;
    }
    throw new UnauthorizedError("Caller must be owner or admin", { caller: ctx.callingUser, owner });
  }

  private ensureAdmin(ctx: GalaChainContext, settings: CreatureSettings) {
    if (ctx.callingUser !== settings.adminAddress) {
      throw new UnauthorizedError("Only admin can perform this action", { caller: ctx.callingUser, admin: settings.adminAddress });
    }
  }

  private ensureNotPaused(settings: CreatureSettings) {
    if (settings.paused) {
      throw new ConflictError("Contract is paused");
    }
  }

  private async collectPayments(
    ctx: GalaChainContext,
    payer: string,
    galaAmount: number,
    soulAmount: number,
    galaTokenInstance: string | undefined,
    soulTokenInstance: string | undefined,
    settings: CreatureSettings,
    refId: string,
    action: string
  ) {
    if (galaAmount > 0) {
      if (!galaTokenInstance) {
        throw new DefaultError("galaTokenInstance is required to collect GALA");
      }
      const { burn, toAdmin } = this.splitPayment(galaAmount);
      const tokenKey = this.parseTokenInstanceKey(galaTokenInstance);
      await this.transfer(ctx, payer, settings.burnAddress, tokenKey, burn, refId, action, "GalaBurn");
      await this.transfer(ctx, payer, settings.adminWallet, tokenKey, toAdmin, refId, action, "GalaAdmin");
    }

    if (soulAmount > 0) {
      if (!soulTokenInstance) {
        throw new DefaultError("soulTokenInstance is required to collect SOUL");
      }
      const { burn, toAdmin } = this.splitPayment(soulAmount);
      const tokenKey = this.parseTokenInstanceKey(soulTokenInstance);
      await this.transfer(ctx, payer, settings.burnAddress, tokenKey, burn, refId, action, "SoulBurn");
      await this.transfer(ctx, payer, settings.adminWallet, tokenKey, toAdmin, refId, action, "SoulAdmin");
    }
  }

  private async transfer(
    ctx: GalaChainContext,
    from: string,
    to: string,
    tokenInstanceKey: TokenInstanceKey,
    quantity: BigNumber,
    refId: string,
    action: string,
    kind: string
  ) {
    if (quantity.lte(0)) {
      return;
    }

    await transferToken(ctx, {
      from: await resolveUserAlias(ctx, from),
      to: await resolveUserAlias(ctx, to),
      tokenInstanceKey,
      quantity,
      allowancesToUse: [],
      authorizedOnBehalf: undefined
    });

    this.emitEvent(ctx, "PaymentSplit", { kind, from, to, quantity: quantity.toString(), refId, action });
  }

  private splitPayment(amount: number): { burn: BigNumber; toAdmin: BigNumber } {
    const burn = new BigNumber(amount).multipliedBy(BURN_PERCENTAGE);
    const toAdmin = new BigNumber(amount).minus(burn);
    return { burn, toAdmin };
  }

  private assertCosts(galaAmount: number, soulAmount: number, requiredGala: number, requiredSoul: number, action: string) {
    if (galaAmount < requiredGala) {
      throw new DefaultError("Insufficient GALA provided", { action, required: requiredGala, provided: galaAmount });
    }
    if (soulAmount < requiredSoul) {
      throw new DefaultError("Insufficient SOUL provided", { action, required: requiredSoul, provided: soulAmount });
    }
  }

  private deriveId(ctx: GalaChainContext, seed: string): string {
    return `${ctx.stub.getTxID()}:${seed}`;
  }

  private parseTokenInstanceKey(queryString: string): TokenInstanceKey {
    try {
      const parsed = JSON.parse(queryString);
      return plainToClass(TokenInstanceKey, parsed);
    } catch {
      const parts = queryString.split(":");
      if (parts.length < 4) {
        throw new DefaultError("Invalid token instance key format", { queryString });
      }
      return plainToClass(TokenInstanceKey, {
        category: parts[0],
        collection: parts[1],
        type: parts[2],
        instance: parts[3],
        additionalKey: parts[4] || undefined
      });
    }
  }

  private async loadSettings(ctx: GalaChainContext): Promise<CreatureSettings> {
    const key = ctx.stub.createCompositeKey(CreatureSettings.INDEX_KEY, ["settings"]);
    const existing = await getObjectByKey(ctx, CreatureSettings, key).catch(() => undefined);
    if (existing) {
      return existing;
    }

    const defaultSettings = new CreatureSettings({
      id: "settings",
      adminAddress: ctx.callingUser,
      adminWallet: ctx.callingUser,
      burnAddress: "burn"
    });
    await putChainObject(ctx, defaultSettings);
    return defaultSettings;
  }

  private emitEvent(ctx: GalaChainContext, name: string, payload: unknown) {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      ctx.stub.setEvent(name, encoded);
    } catch {
      // best-effort
    }
  }
}


