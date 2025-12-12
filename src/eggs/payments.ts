import { BigNumberProperty, ChainKey, ChainObject } from "@gala-chain/api";
import BigNumber from "bignumber.js";
import { IsNumber, IsString } from "class-validator";

export class PaymentRecord extends ChainObject {
  static INDEX_KEY = "GCEGGPAY";

  @ChainKey({ position: 0 })
  @IsString()
  public readonly id: string;

  @IsString()
  public readonly payer: string;

  @BigNumberProperty()
  public readonly galaAmount: BigNumber;

  @BigNumberProperty()
  public readonly pooled: BigNumber;

  @BigNumberProperty()
  public readonly sentToAdmin: BigNumber;

  @IsString()
  public readonly adminAddress: string;

  @IsString()
  public readonly poolAddress: string;

  @IsNumber()
  public readonly createdAt: number;

  constructor(params: {
    id: string;
    payer: string;
    galaAmount: BigNumber;
    pooled: BigNumber;
    sentToAdmin: BigNumber;
    adminAddress: string;
    poolAddress: string;
    createdAt: number;
  }) {
    super();
    this.id = params.id;
    this.payer = params.payer;
    this.galaAmount = params.galaAmount;
    this.pooled = params.pooled;
    this.sentToAdmin = params.sentToAdmin;
    this.adminAddress = params.adminAddress;
    this.poolAddress = params.poolAddress;
    this.createdAt = params.createdAt;
  }
}

