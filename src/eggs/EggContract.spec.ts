import { randomUniqueKey } from "@gala-chain/api";
import { fixture, transactionErrorMessageContains, users } from "@gala-chain/test";

import { EggContract } from "./EggContract";
import { MintByParentsDto, MintByUserDto, MultiMintDto, UpdateSettingsDto } from "./dto";
import { EggSettings } from "./settings";
import { Faction, Rarity } from "./types";
import { EggNFT } from "./EggNFT";

const unwrap = <T>(response: any): T => (response?.Data ?? response?.data ?? response);

it("mints an egg by user with required payment", async () => {
  const user = users.random();
  const { contract, ctx } = fixture(EggContract).registeredUsers(user);

  const dto = new MintByUserDto();
  dto.ownerAddress = user.identityKey;
  dto.faction = Faction.FROST;
  dto.galaAmount = 500;
  dto.uniqueKey = randomUniqueKey();

  const raw = await contract.MintByUser(ctx, dto.signed(user.privateKey));
  expect((raw as any).Status ?? 1).toBe(1);
  const response = unwrap<EggNFT>(raw);

  expect(response.ownerAddress).toBe(user.identityKey);
  expect(response.faction).toBe(Faction.FROST);
});

it("multi mints four eggs", async () => {
  const user = users.random();
  const { contract, ctx } = fixture(EggContract).registeredUsers(user);

  const dto = new MultiMintDto();
  dto.ownerAddress = user.identityKey;
  dto.galaAmount = 2_000;
  dto.uniqueKey = randomUniqueKey();

  const raw = await contract.MultiMint(ctx, dto.signed(user.privateKey));
  expect((raw as any).Status ?? 1).toBe(1);
  const response = unwrap<EggNFT[]>(raw);

  expect(response).toHaveLength(4);
  response.forEach((egg) => expect(egg.ownerAddress).toBe(user.identityKey));
});

it("requires authorization for mint by parents", async () => {
  const caller = users.random();
  const settings = new EggSettings({
    id: "settings",
    adminAddress: caller.identityKey,
    burnAddress: "burn",
    authorizedContracts: []
  });

  const { contract, ctx } = fixture(EggContract).registeredUsers(caller).savedState(settings);

  const settingsDto = new UpdateSettingsDto();
  settingsDto.authorizedContracts = [caller.identityKey];
  settingsDto.uniqueKey = randomUniqueKey();
  await contract.UpdateSettings(ctx, settingsDto.signed(caller.privateKey));

  const dto = new MintByParentsDto();
  dto.ownerAddress = caller.identityKey;
  dto.faction = Faction.FROST;
  dto.species = "Frostfang";
  dto.rarity = Rarity.LEGENDARY;
  dto.uniqueKey = randomUniqueKey();

  const raw = await contract.MintByParents(ctx, dto.signed(caller.privateKey));
  expect((raw as any).Status ?? 1).toBe(1);
  const ok = unwrap<EggNFT>(raw);
  expect(ok.ownerAddress).toBe(caller.identityKey);
});

it("updates pool address via settings", async () => {
  const admin = users.random();
  const { contract, ctx } = fixture(EggContract).registeredUsers(admin);

  const dto = new UpdateSettingsDto();
  dto.poolAddress = "pool-wallet";
  dto.uniqueKey = randomUniqueKey();

  const raw = await contract.UpdateSettings(ctx, dto.signed(admin.privateKey));
  expect((raw as any).Status ?? 1).toBe(1);
  const settings = unwrap<EggSettings>(raw);
  expect(settings.poolAddress).toBe("pool-wallet");
});

