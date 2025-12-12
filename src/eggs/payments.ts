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
  public readonly burned: BigNumber;

  @BigNumberProperty()
  public readonly sentToAdmin: BigNumber;

  @IsString()
  public readonly adminAddress: string;

  @IsString()
  public readonly burnAddress: string;

  @IsNumber()
  public readonly createdAt: number;

  constructor(params: {
    id: string;
    payer: string;
    galaAmount: BigNumber;
    burned: BigNumber;
    sentToAdmin: BigNumber;
    adminAddress: string;
    burnAddress: string;
    createdAt: number;
  }) {
    super();
    this.id = params.id;
    this.payer = params.payer;
    this.galaAmount = params.galaAmount;
    this.burned = params.burned;
    this.sentToAdmin = params.sentToAdmin;
    this.adminAddress = params.adminAddress;
    this.burnAddress = params.burnAddress;
    this.createdAt = params.createdAt;
  }
}

