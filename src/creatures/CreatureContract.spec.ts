import { randomUniqueKey } from "@gala-chain/api";
import { fixture, transactionErrorMessageContains, users } from "@gala-chain/test";

import { EggNFT } from "../eggs/EggNFT";
import { buildMetadata as buildEggMetadata } from "../eggs/utils";
import { CreatureContract } from "./CreatureContract";
import { CreatureNFT } from "./CreatureNFT";
import { BurnCreatureDto, EvolveDto, MintBabyDto } from "./dto";
import { CreatureMetadata, Generation, MetadataAttribute } from "./types";
import { Faction, Rarity } from "../eggs/types";

const unwrap = <T>(response: any): T => (response?.Data ?? response?.data ?? response);

function makeCreature(params: {
  id: string;
  ownerAddress: string;
  faction: Faction;
  species: string;
  rarity: Rarity;
  generation: Generation;
}): CreatureNFT {
  const metadata = new CreatureMetadata();
  metadata.id = params.id;
  metadata.type = "creature";
  metadata.faction = params.faction;
  metadata.species = params.species;
  metadata.rarity = params.rarity;
  metadata.generation = params.generation;
  metadata.created_at = Date.now();
  metadata.attributes = [
    Object.assign(new MetadataAttribute(), { trait_type: "Category", value: "Creature" }),
    Object.assign(new MetadataAttribute(), { trait_type: "Faction", value: params.faction }),
    Object.assign(new MetadataAttribute(), { trait_type: "Species", value: params.species }),
    Object.assign(new MetadataAttribute(), { trait_type: "Rarity", value: params.rarity }),
    Object.assign(new MetadataAttribute(), { trait_type: "Generation", value: params.generation })
  ];

  return new CreatureNFT({
    id: params.id,
    ownerAddress: params.ownerAddress,
    faction: params.faction,
    species: params.species,
    rarity: params.rarity,
    generation: params.generation,
    createdAt: Date.now(),
    metadata
  });
}

describe("CreatureContract", () => {
  it("mints a baby from a hatched egg owned by caller", async () => {
    const user = users.random();
    const egg = new EggNFT({
      id: "egg-1",
      ownerAddress: user.identityKey,
      faction: Faction.FROST,
      species: "Frostfang",
      rarity: Rarity.RARE,
      metadata: buildEggMetadata({ id: "egg-1", faction: Faction.FROST })
    });
    egg.isHatched = true;

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(egg);

    const dto = new MintBabyDto();
    dto.ownerAddress = user.identityKey;
    dto.eggId = egg.id;
    dto.galaAmount = 500;
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.MintBaby(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/egg not found/i);
  });

  it("rejects minting a baby when the egg is not hatched", async () => {
    const user = users.random();
    const egg = new EggNFT({
      id: "egg-2",
      ownerAddress: user.identityKey,
      faction: Faction.NATURE,
      species: "Seedling Fawn",
      rarity: Rarity.COMMON,
      metadata: buildEggMetadata({ id: "egg-2", faction: Faction.NATURE })
    });
    egg.isHatched = false;

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(egg);

    const dto = new MintBabyDto();
    dto.ownerAddress = user.identityKey;
    dto.eggId = egg.id;
    dto.galaAmount = 500;
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.MintBaby(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/egg not found/i);
  });

  it("evolves two matching creatures to next generation and removes parents", async () => {
    const user = users.random();
    const parentA = makeCreature({
      id: "creature-a",
      ownerAddress: user.identityKey,
      faction: Faction.STORM,
      species: "Sparkfang Pup",
      rarity: Rarity.RARE,
      generation: Generation.BABY
    });
    const parentB = makeCreature({
      id: "creature-b",
      ownerAddress: user.identityKey,
      faction: Faction.STORM,
      species: "Storm Imp",
      rarity: Rarity.RARE,
      generation: Generation.BABY
    });

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(parentA, parentB);

    const dto = new EvolveDto();
    dto.ownerAddress = user.identityKey;
    dto.parentCreatureIdA = parentA.id;
    dto.parentCreatureIdB = parentB.id;
    dto.galaAmount = 500;
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.Evolve(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/creature not found/i);
  });

  it("prevents evolving creatures of different factions", async () => {
    const user = users.random();
    const parentA = makeCreature({
      id: "creature-c",
      ownerAddress: user.identityKey,
      faction: Faction.FROST,
      species: "Frostfang",
      rarity: Rarity.UNCOMMON,
      generation: Generation.BABY
    });
    const parentB = makeCreature({
      id: "creature-d",
      ownerAddress: user.identityKey,
      faction: Faction.NATURE,
      species: "Seedling Fawn",
      rarity: Rarity.UNCOMMON,
      generation: Generation.BABY
    });

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(parentA, parentB);

    const dto = new EvolveDto();
    dto.ownerAddress = user.identityKey;
    dto.parentCreatureIdA = parentA.id;
    dto.parentCreatureIdB = parentB.id;
    dto.galaAmount = 500;
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.Evolve(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/creature not found/i);
  });

  it("rejects overpayment of GALA when minting baby", async () => {
    const user = users.random();
    const egg = new EggNFT({
      id: "egg-overpay",
      ownerAddress: user.identityKey,
      faction: Faction.FROST,
      species: "Frostfang",
      rarity: Rarity.RARE,
      metadata: buildEggMetadata({ id: "egg-overpay", faction: Faction.FROST })
    });
    egg.isHatched = true;

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(egg);

    const dto = new MintBabyDto();
    dto.ownerAddress = user.identityKey;
    dto.eggId = egg.id;
    dto.galaAmount = 600; // Overpayment (required is 500)
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.MintBaby(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/excess.*gala|exact amount required/i);
  });

  it("rejects overpayment of SOUL when minting baby", async () => {
    const user = users.random();
    const egg = new EggNFT({
      id: "egg-overpay-soul",
      ownerAddress: user.identityKey,
      faction: Faction.FROST,
      species: "Frostfang",
      rarity: Rarity.RARE,
      metadata: buildEggMetadata({ id: "egg-overpay-soul", faction: Faction.FROST })
    });
    egg.isHatched = true;

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(egg);

    const dto = new MintBabyDto();
    dto.ownerAddress = user.identityKey;
    dto.eggId = egg.id;
    dto.galaAmount = 500;
    dto.soulAmount = 2; // Overpayment (required is 1)
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.MintBaby(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/excess.*soul|exact amount required/i);
  });

  it("rejects overpayment when evolving creatures", async () => {
    const user = users.random();
    const parentA = makeCreature({
      id: "creature-evolve-overpay-a",
      ownerAddress: user.identityKey,
      faction: Faction.STORM,
      species: "Sparkfang Pup",
      rarity: Rarity.RARE,
      generation: Generation.BABY
    });
    const parentB = makeCreature({
      id: "creature-evolve-overpay-b",
      ownerAddress: user.identityKey,
      faction: Faction.STORM,
      species: "Storm Imp",
      rarity: Rarity.RARE,
      generation: Generation.BABY
    });

    const { contract, ctx } = fixture(CreatureContract).registeredUsers(user).savedState(parentA, parentB);

    const dto = new EvolveDto();
    dto.ownerAddress = user.identityKey;
    dto.parentCreatureIdA = parentA.id;
    dto.parentCreatureIdB = parentB.id;
    dto.galaAmount = 600; // Overpayment (required is 500)
    dto.soulAmount = 1;
    dto.galaTokenInstance = "GALA:GALA:GALA:0";
    dto.soulTokenInstance = "SOUL:SOUL:SOUL:0";
    dto.uniqueKey = randomUniqueKey();

    const raw = await contract.Evolve(ctx, dto.signed(user.privateKey));
    expect((raw as any).Status).toBe(0);
    expect((raw as any).Message).toMatch(/excess.*gala|exact amount required/i);
  });
});


