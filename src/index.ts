// sort-imports-ignore

import "dotenv/config";

import { GalaContract, GalaJSONSerializer } from "@gala-chain/chaincode";

import { GalaChainTokenContract } from "./token";
import { PublicKeyContract } from "./pk";
import { EggContract } from "./eggs";
import { SoulContract } from "./soul";
import { IncubatorContract } from "./incubator";
import { CreatureContract } from "./creatures";

export const contracts: { new (): GalaContract }[] = [
  PublicKeyContract,
  GalaChainTokenContract,
  EggContract,
  SoulContract,
  IncubatorContract,
  CreatureContract
];

export const serializers = {
  transaction: "galaJsonSerializer",
  serializers: {
    galaJsonSerializer: GalaJSONSerializer
  }
};
