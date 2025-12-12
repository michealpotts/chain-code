import { ChainKey, ChainObject } from "@gala-chain/api";
import { IsNumber, IsString } from "class-validator";

export class IncubationSession extends ChainObject {
  static INDEX_KEY = "GCINCSESS";
  static USER_INDEX_KEY = "GCINCUSER"; // For querying by user

  @ChainKey({ position: 0 })
  @IsString()
  public readonly sessionId: string; // Format: "userAddress:eggId"

  @IsString()
  public readonly userId: string;

  @IsString()
  public readonly eggId: string;

  @IsNumber()
  public startTime: number; // Unix timestamp in milliseconds

  @IsNumber()
  public endTime: number; // Unix timestamp in milliseconds

  @IsNumber()
  public originalDurationHours: number; // Original incubation duration

  @IsNumber()
  public remainingHours: number; // Remaining hours (can be reduced by speed-up)

  @IsNumber()
  public totalSpeedUpHours: number; // Total hours reduced by speed-ups

  @IsNumber()
  public totalGalaSpent: number; // Total GALA spent on speed-ups

  constructor(params: {
    sessionId: string;
    userId: string;
    eggId: string;
    startTime: number;
    endTime: number;
    originalDurationHours: number;
    remainingHours: number;
    totalSpeedUpHours?: number;
    totalGalaSpent?: number;
  }) {
    super();
    this.sessionId = params.sessionId;
    this.userId = params.userId;
    this.eggId = params.eggId;
    this.startTime = params.startTime;
    this.endTime = params.endTime;
    this.originalDurationHours = params.originalDurationHours;
    this.remainingHours = params.remainingHours;
    this.totalSpeedUpHours = params.totalSpeedUpHours ?? 0;
    this.totalGalaSpent = params.totalGalaSpent ?? 0;
  }

  isComplete(currentTime: number): boolean {
    return currentTime >= this.endTime;
  }

  getRemainingTimeMs(currentTime: number): number {
    return Math.max(0, this.endTime - currentTime);
  }
}

