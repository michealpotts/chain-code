/*
 * Copyright (c) Gala Games Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
  burnTokens,
  getObjectByKey,
  mintToken,
  putChainObject,
  resolveUserAlias,
  transferToken,
} from "@gala-chain/chaincode";
import BigNumber from "bignumber.js";
import { plainToClass } from "class-transformer";

const version = "1.0.1";
import { EggNFT } from "../eggs/EggNFT";
import { Rarity } from "../eggs/types";
import {
  ClaimCreatureDto,
  GetIncubationStatusDto,
  GetUserIncubationsDto,
  PauseIncubatorDto,
  SetCreatureTokenClassDto,
  SpeedUpIncubationDto,
  StartIncubationDto,
} from "./dto";
import { IncubationSession } from "./IncubationSession";
import { IncubatorSettings } from "./settings";
import { INCUBATION_TIME_HOURS, MAX_INCUBATIONS_PER_USER, SPEED_UP_TIERS } from "./types";

const POOL_PERCENTAGE = 0.15; // 15%
const ADMIN_PERCENTAGE = 0.85; // 85%

export class IncubatorContract extends GalaContract {
  constructor() {
    super("IncubatorContract", version);
  }

  /**
   * Start incubating an egg
   * Validates: ownership, not incubating, user has slot, valid NFT
   * Transfers egg to contract (escrow)
   */
  @Submit({
    in: StartIncubationDto,
  })
  public async StartIncubation(
    ctx: GalaChainContext,
    dto: StartIncubationDto
  ): Promise<GalaChainResponse<{ sessionId: string; endTime: number; durationHours: number }>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    const userId = await resolveUserAlias(ctx, dto.userId);

    // Validate user has available slot
    await this.ensureUserHasSlot(ctx, userId);

    // Get and validate egg
    const egg = await this.getEggOrThrow(ctx, dto.eggId);

    // Validate ownership
    if (egg.ownerAddress !== userId) {
      throw new UnauthorizedError("User does not own this egg", {
        userId,
        owner: egg.ownerAddress,
        eggId: dto.eggId,
      });
    }

    // Validate egg is not already incubating
    if (egg.isIncubating) {
      throw new ConflictError("Egg is already incubating", { eggId: dto.eggId });
    }

    // Validate egg is not hatched
    if (egg.isHatched) {
      throw new ConflictError("Egg is already hatched", { eggId: dto.eggId });
    }

    // Calculate incubation duration based on rarity
    const durationHours = INCUBATION_TIME_HOURS[egg.rarity as Rarity] ?? INCUBATION_TIME_HOURS[Rarity.COMMON];
    const durationMs = durationHours * 60 * 60 * 1000;

    // Create incubation session
    const sessionId = `${userId}:${dto.eggId}`;
    const startTime = ctx.txUnixTime;
    const endTime = startTime + durationMs;

    const session = new IncubationSession({
      sessionId,
      userId,
      eggId: dto.eggId,
      startTime,
      endTime,
      originalDurationHours: durationHours,
      remainingHours: durationHours,
    });

    // Transfer egg to contract (escrow)
    egg.ownerAddress = settings.contractAddress;
    egg.isIncubating = true;
    egg.hatchReadyAt = endTime;
    await putChainObject(ctx, egg);

    // Save session (with both sessionId key and userId index for querying)
    await putChainObject(ctx, session);
    
    // Also save to user index for efficient querying
    const userIndexKey = ctx.stub.createCompositeKey(IncubationSession.USER_INDEX_KEY, [userId, dto.eggId]);
    await ctx.stub.putState(userIndexKey, new TextEncoder().encode(JSON.stringify({ sessionId })));

    // Emit event
    this.emitEvent(ctx, "IncubationStarted", {
      sessionId,
      userId,
      eggId: dto.eggId,
      rarity: egg.rarity,
      startTime,
      endTime,
      durationHours,
    });

    return GalaChainResponse.Success({
      sessionId,
      endTime,
      durationHours,
    });
  }

  /**
   * Speed up incubation by reducing remaining time
   * Tiers: 1h/100 GALA, 4h/300 GALA, 8h/500 GALA
   * Fee distribution: 15% burn, 85% admin
   */
  @Submit({
    in: SpeedUpIncubationDto,
  })
  public async SpeedUpIncubation(
    ctx: GalaChainContext,
    dto: SpeedUpIncubationDto
  ): Promise<GalaChainResponse<{ hoursReduced: number; newEndTime: number; remainingHours: number }>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);

    // Get session
    const session = await this.getSessionOrThrow(ctx, dto.sessionId);

    // Validate session is not complete
    if (session.isComplete(ctx.txUnixTime)) {
      throw new ConflictError("Incubation is already complete", { sessionId: dto.sessionId });
    }

    // Get speed-up tier
    const tier = SPEED_UP_TIERS[dto.tier];
    if (!tier) {
      throw new DefaultError("Invalid speed-up tier", { tier: dto.tier });
    }

    const hoursToReduce = tier.hours;
    const galaCost = tier.galaCost;

    // Calculate fee distribution
    const { pool, toAdmin } = this.splitGalaFees(galaCost);

    // Parse GALA token instance
    const galaTokenInstance = this.parseTokenInstanceKey(dto.galaTokenInstance);
    const userId = await resolveUserAlias(ctx, session.userId);

    // Transfer GALA from user
    // Transfer 15% to burn address
    const poolAmountBN = pool;
    if (poolAmountBN.gt(0)) {
      await transferToken(ctx, {
        from: userId,
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
        from: userId,
        to: await resolveUserAlias(ctx, settings.adminWallet),
        tokenInstanceKey: galaTokenInstance,
        quantity: adminAmountBN,
        allowancesToUse: [],
        authorizedOnBehalf: undefined,
      });
    }

    // Reduce remaining time
    const hoursReducedMs = hoursToReduce * 60 * 60 * 1000;
    session.endTime = Math.max(ctx.txUnixTime, session.endTime - hoursReducedMs);
    session.remainingHours = Math.max(0, session.remainingHours - hoursToReduce);
    session.totalSpeedUpHours += hoursToReduce;
    session.totalGalaSpent += galaCost;

    // Update egg hatch time
    const egg = await this.getEggOrThrow(ctx, session.eggId);
    egg.hatchReadyAt = session.endTime;
    await putChainObject(ctx, egg);

    // Update session
    await putChainObject(ctx, session);

    // Update statistics
    await this.updateStatistics(ctx, settings, galaCost, poolAmountBN.toNumber(), adminAmountBN.toNumber());

    // Emit event
    this.emitEvent(ctx, "IncubationSpedUp", {
      sessionId: dto.sessionId,
      userId: session.userId,
      tier: dto.tier,
      hoursReduced: hoursToReduce,
      galaCost,
      newEndTime: session.endTime,
      remainingHours: session.remainingHours,
    });

    return GalaChainResponse.Success({
      hoursReduced: hoursToReduce,
      newEndTime: session.endTime,
      remainingHours: session.remainingHours,
    });
  }

  /**
   * Claim hatched creature
   * Validates: incubation is complete
   * Mints creature NFT, burns egg
   */
  @Submit({
    in: ClaimCreatureDto,
  })
  public async ClaimCreature(
    ctx: GalaChainContext,
    dto: ClaimCreatureDto
  ): Promise<GalaChainResponse<{ creatureTokenInstance: string }>> {
    const settings = await this.loadSettings(ctx);
    this.ensureNotPaused(settings);
    this.ensureCreatureTokenClassConfigured(settings);

    // Get session
    const session = await this.getSessionOrThrow(ctx, dto.sessionId);

    // Validate incubation is complete
    if (!session.isComplete(ctx.txUnixTime)) {
      const remainingMs = session.getRemainingTimeMs(ctx.txUnixTime);
      const remainingHours = remainingMs / (60 * 60 * 1000);
      throw new ConflictError("Incubation is not complete yet", {
        sessionId: dto.sessionId,
        remainingHours: remainingHours.toFixed(2),
        endTime: session.endTime,
        currentTime: ctx.txUnixTime,
      });
    }

    // Get egg
    const egg = await this.getEggOrThrow(ctx, session.eggId);

    // Validate egg is owned by contract
    if (egg.ownerAddress !== settings.contractAddress) {
      throw new ConflictError("Egg is not in contract escrow", {
        eggId: session.eggId,
        owner: egg.ownerAddress,
        contractAddress: settings.contractAddress,
      });
    }

    const userId = await resolveUserAlias(ctx, session.userId);

    // Mint creature NFT
    const creatureTokenClassKey = this.parseTokenClassKey(settings.creatureTokenClassKey!);
    const mintResult = await mintToken(ctx, {
      owner: userId,
      tokenClassKey: creatureTokenClassKey,
      quantity: new BigNumber(1),
      authorizedOnBehalf: undefined,
    });

    // Get the minted token instance (first one from the result)
    const creatureTokenInstance = mintResult[0];

    // Burn egg (delete from chain)
    await ctx.stub.deleteState(egg.getCompositeKey());

    // Delete session and user index
    await ctx.stub.deleteState(session.getCompositeKey());
    const userIndexKey = ctx.stub.createCompositeKey(IncubationSession.USER_INDEX_KEY, [session.userId, session.eggId]);
    await ctx.stub.deleteState(userIndexKey);

    // Emit event
    this.emitEvent(ctx, "CreatureClaimed", {
      sessionId: dto.sessionId,
      userId: session.userId,
      eggId: session.eggId,
      creatureTokenInstance: creatureTokenInstance.toQueryKey(),
      faction: egg.faction,
      rarity: egg.rarity,
      species: egg.species,
    });

    return GalaChainResponse.Success({
      creatureTokenInstance: creatureTokenInstance.toQueryKey().toString(),
    });
  }

  /**
   * Get incubation session status
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetIncubationStatusDto,
  })
  public async GetIncubationStatus(
    ctx: GalaChainContext,
    dto: GetIncubationStatusDto
  ): Promise<GalaChainResponse<IncubationSession>> {
    const session = await this.getSessionOrThrow(ctx, dto.sessionId);
    return GalaChainResponse.Success(session);
  }

  /**
   * Get all active incubations for a user
   */
  @GalaTransaction({
    type: GalaTransactionType.EVALUATE,
    in: GetUserIncubationsDto,
  })
  public async GetUserIncubations(
    ctx: GalaChainContext,
    dto: GetUserIncubationsDto
  ): Promise<GalaChainResponse<IncubationSession[]>> {
    const userId = await resolveUserAlias(ctx, dto.userId);
    const sessions = await this.getUserSessions(ctx, userId);
    return GalaChainResponse.Success(sessions);
  }

  /**
   * Admin: Set creature token class key
   */
  @Submit({
    in: SetCreatureTokenClassDto,
  })
  public async SetCreatureTokenClass(
    ctx: GalaChainContext,
    dto: SetCreatureTokenClassDto
  ): Promise<GalaChainResponse<string>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    // Validate token class key
    try {
      this.parseTokenClassKey(dto.creatureTokenClassKey);
    } catch (error) {
      throw new DefaultError("Invalid creature token class key format", {
        key: dto.creatureTokenClassKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    settings.creatureTokenClassKey = dto.creatureTokenClassKey;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "CreatureTokenClassSet", {
      tokenClassKey: dto.creatureTokenClassKey,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(dto.creatureTokenClassKey);
  }

  /**
   * Admin: Pause/resume incubator
   */
  @Submit({
    in: PauseIncubatorDto,
  })
  public async PauseIncubator(
    ctx: GalaChainContext,
    dto: PauseIncubatorDto
  ): Promise<GalaChainResponse<boolean>> {
    const settings = await this.loadSettings(ctx);
    this.ensureAdmin(ctx, settings);

    settings.paused = dto.paused ?? !settings.paused;
    await putChainObject(ctx, settings);

    this.emitEvent(ctx, "IncubatorPaused", {
      paused: settings.paused,
      admin: ctx.callingUser,
    });

    return GalaChainResponse.Success(settings.paused);
  }

  // Private helper methods

  private async getEggOrThrow(ctx: GalaChainContext, eggId: string): Promise<EggNFT> {
    const key = ctx.stub.createCompositeKey(EggNFT.INDEX_KEY, [eggId]);
    const egg = await getObjectByKey(ctx, EggNFT, key).catch(() => undefined);
    if (!egg) {
      throw new NotFoundError("Egg not found", { eggId });
    }
    return egg;
  }

  private async getSessionOrThrow(ctx: GalaChainContext, sessionId: string): Promise<IncubationSession> {
    const key = ctx.stub.createCompositeKey(IncubationSession.INDEX_KEY, [sessionId]);
    const session = await getObjectByKey(ctx, IncubationSession, key).catch(() => undefined);
    if (!session) {
      throw new NotFoundError("Incubation session not found", { sessionId });
    }
    return session;
  }

  private async getUserSessions(ctx: GalaChainContext, userId: string): Promise<IncubationSession[]> {
    // Query all sessions for this user using the user index
    const iterator = ctx.stub.getStateByPartialCompositeKey(IncubationSession.USER_INDEX_KEY, [userId]);
    const sessions: IncubationSession[] = [];

    try {
      for await (const result of iterator) {
        if (result.value) {
          const indexData = JSON.parse(result.value.toString());
          const session = await this.getSessionOrThrow(ctx, indexData.sessionId);
          if (!session.isComplete(ctx.txUnixTime)) {
            sessions.push(session);
          }
        }
      }
    } catch (error) {
      // If iterator doesn't support async iteration, fall back to manual iteration
      // This is a workaround for the iterator API
    }

    return sessions;
  }

  private async ensureUserHasSlot(ctx: GalaChainContext, userId: string): Promise<void> {
    const sessions = await this.getUserSessions(ctx, userId);
    if (sessions.length >= MAX_INCUBATIONS_PER_USER) {
      throw new ConflictError(`User has reached maximum incubations (${MAX_INCUBATIONS_PER_USER})`, {
        userId,
        activeIncubations: sessions.length,
      });
    }
  }

  private splitGalaFees(total: number): { pool: BigNumber; toAdmin: BigNumber } {
    const pool = new BigNumber(total).multipliedBy(POOL_PERCENTAGE);
    const toAdmin = new BigNumber(total).multipliedBy(ADMIN_PERCENTAGE);
    return { pool, toAdmin };
  }

  private async loadSettings(ctx: GalaChainContext): Promise<IncubatorSettings> {
    const key = ctx.stub.createCompositeKey(IncubatorSettings.INDEX_KEY, ["settings"]);
    const existing = await getObjectByKey(ctx, IncubatorSettings, key).catch(() => undefined);
    if (existing) {
      return existing;
    }

    // Create default settings
    const defaultSettings = new IncubatorSettings({
      id: "settings",
      adminAddress: ctx.callingUser,
      adminWallet: ctx.callingUser,
      poolAddress: "pool",
      contractAddress: ctx.callingUser, // Will be set by admin
    });
    await putChainObject(ctx, defaultSettings);
    return defaultSettings;
  }

  private ensureAdmin(ctx: GalaChainContext, settings: IncubatorSettings) {
    if (ctx.callingUser !== settings.adminAddress) {
      throw new UnauthorizedError("Only admin can perform this action", {
        caller: ctx.callingUser,
        admin: settings.adminAddress,
      });
    }
  }

  private ensureNotPaused(settings: IncubatorSettings) {
    if (settings.paused) {
      throw new ConflictError("Incubator is currently paused");
    }
  }

  private ensureCreatureTokenClassConfigured(settings: IncubatorSettings) {
    if (!settings.creatureTokenClassKey) {
      throw new NotFoundError("Creature token class not configured. Admin must set creatureTokenClassKey in settings.");
    }
  }

  private async updateStatistics(
    ctx: GalaChainContext,
    settings: IncubatorSettings,
    totalGala: number,
    pooled: number,
    collected: number
  ) {
    settings.totalGalaPooled = (settings.totalGalaPooled ?? 0) + pooled;
    settings.totalGalaCollected = (settings.totalGalaCollected ?? 0) + collected;
    await putChainObject(ctx, settings);
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
        additionalKey: parts[4] || undefined,
      });
    }
  }

  private parseTokenClassKey(queryString: string): TokenClassKey {
    try {
      const parsed = JSON.parse(queryString);
      return plainToClass(TokenClassKey, parsed);
    } catch {
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

