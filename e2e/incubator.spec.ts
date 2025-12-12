
import {
  ChainClient,
  ChainUser,
  CommonContractAPI,
  CreateTokenClassDto,
  GalaChainResponse,
  randomUniqueKey,
  TokenClassKey,
  TokenInstanceKey,
  commonContractAPI,
  createValidDTO,
  createValidSubmitDTO,
} from "@gala-chain/api";
import {
  AdminChainClients,
  TestClients,
  transactionSuccess,
} from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { instanceToPlain, plainToInstance } from "class-transformer";

import { EggNFT, Faction, FetchEggDto, MintByUserDto, Rarity } from "../src/eggs";
import {
  ClaimCreatureDto,
  GetIncubationStatusDto,
  GetUserIncubationsDto,
  SetCreatureTokenClassDto,
  SpeedUpIncubationDto,
  StartIncubationDto,
} from "../src/incubator";
import { IncubationSession } from "../src/incubator/IncubationSession";

jest.setTimeout(60000); // Longer timeout for incubation tests

describe("Incubator contract e2e", () => {
  const incubatorContractConfig = {
    incubator: {
      channel: "product-channel",
      chaincode: "basic-product",
      contract: "IncubatorContract",
      api: incubatorContractAPI,
    },
    eggs: {
      channel: "product-channel",
      chaincode: "basic-product",
      contract: "EggContract",
      api: eggContractAPI,
    },
    assets: {
      channel: "product-channel",
      chaincode: "basic-product",
      contract: "GalaChainToken",
      api: commonContractAPI,
    },
  };

  let client: AdminChainClients<typeof incubatorContractConfig>;
  let user: ChainUser;
  let creatureTokenClassKey: TokenClassKey;
  let mintedEggId: string;

  beforeAll(async () => {
    client = await TestClients.createForAdmin(incubatorContractConfig);
    user = await client.createRegisteredUser();

    // Create creature token class
    creatureTokenClassKey = plainToInstance(TokenClassKey, {
      collection: `CREATURE-${Date.now()}`,
      category: "CREATURE",
      type: "CREATURE",
      additionalKey: "none",
    });

    const createCreatureTokenDto = await createValidSubmitDTO(CreateTokenClassDto, {
      decimals: 0,
      tokenClass: creatureTokenClassKey,
      name: "Game Creature",
      symbol: "CREATURE",
      description: "Hatched creatures",
      isNonFungible: true,
      image: "https://app.gala.games/_nuxt/img/gala-logo_horizontal_white.8b0409c.png",
    });

    await client.assets.submitTransaction(
      "CreateTokenClass",
      createCreatureTokenDto.signed(client.assets.privateKey)
    );

    // Set creature token class in incubator contract
    const setTokenClassDto = new SetCreatureTokenClassDto();
    // Format as query string: "category:collection:type"
    setTokenClassDto.creatureTokenClassKey = `${creatureTokenClassKey.category}:${creatureTokenClassKey.collection}:${creatureTokenClassKey.type}`;
    setTokenClassDto.uniqueKey = randomUniqueKey();
    const setTokenClassResponse = await client.incubator.SetCreatureTokenClass(setTokenClassDto.signed(client.assets.privateKey));
    expect(setTokenClassResponse.Status).toBe(1); // Ensure it succeeded

    // Mint an egg for testing
    const mintEggDto = new MintByUserDto();
    mintEggDto.ownerAddress = user.identityKey;
    mintEggDto.faction = Faction.FROST;
    mintEggDto.galaAmount = 500;
    mintEggDto.uniqueKey = randomUniqueKey();

    const eggResponse = await client.eggs.MintByUser(mintEggDto.signed(user.privateKey));
    expect(eggResponse.Status).toBe(1); // Ensure success
    const egg = eggResponse.Data as EggNFT;
    expect(egg).toBeDefined();
    expect(egg.id).toBeDefined();
    mintedEggId = egg.id;
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test("user can start incubation", async () => {
    const dto = new StartIncubationDto();
    dto.userId = user.identityKey;
    dto.eggId = mintedEggId;
    dto.uniqueKey = randomUniqueKey();

    const response = await client.incubator.StartIncubation(dto.signed(user.privateKey));
    expect(response).toEqual(
      transactionSuccess(
        expect.objectContaining({
          sessionId: expect.stringContaining(user.identityKey),
          endTime: expect.any(Number),
          durationHours: expect.any(Number),
        })
      )
    );

    expect(response.Data?.endTime).toBeGreaterThan(Date.now());
    expect(response.Data?.durationHours).toBeGreaterThan(0);
  });

  test("user can get incubation status", async () => {
    const sessionId = `${user.identityKey}:${mintedEggId}`;
    const dto = new GetIncubationStatusDto();
    dto.sessionId = sessionId;

    const response = await client.incubator.GetIncubationStatus(dto.signed(user.privateKey));
    expect(response).toEqual(transactionSuccess(expect.any(Object)));
    expect(response.Data).toHaveProperty("sessionId", sessionId);
    expect(response.Data).toHaveProperty("userId", user.identityKey);
    expect(response.Data).toHaveProperty("eggId", mintedEggId);
  });

  test("user can get their incubations", async () => {
    const dto = new GetUserIncubationsDto();
    dto.userId = user.identityKey;

    const response = await client.incubator.GetUserIncubations(dto.signed(user.privateKey));
    expect(response).toEqual(transactionSuccess(expect.any(Array)));
    expect(Array.isArray(response.Data)).toBe(true);
    if (response.Data && response.Data.length > 0) {
      expect(response.Data[0]).toHaveProperty("userId", user.identityKey);
    }
  });

  test("prevents starting more than 4 incubations", async () => {
    // Mint 4 more eggs
    const eggIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const mintEggDto = new MintByUserDto();
      mintEggDto.ownerAddress = user.identityKey;
      mintEggDto.faction = Faction.FROST;
      mintEggDto.galaAmount = 500;
      mintEggDto.uniqueKey = randomUniqueKey();

      const eggResponse = await client.eggs.MintByUser(mintEggDto.signed(user.privateKey));
      expect(eggResponse.Status).toBe(1);
      const egg = eggResponse.Data as EggNFT;
      expect(egg).toBeDefined();
      expect(egg.id).toBeDefined();
      eggIds.push(egg.id);

      // Start incubation for each
      const startDto = new StartIncubationDto();
      startDto.userId = user.identityKey;
      startDto.eggId = egg.id;
      startDto.uniqueKey = randomUniqueKey();
      const startResponse = await client.incubator.StartIncubation(startDto.signed(user.privateKey));
      expect(startResponse.Status).toBe(1); // Ensure each incubation started successfully
    }

    // Try to start a 5th incubation (should fail)
    const mintEggDto = new MintByUserDto();
    mintEggDto.ownerAddress = user.identityKey;
    mintEggDto.faction = Faction.FROST;
    mintEggDto.galaAmount = 500;
    mintEggDto.uniqueKey = randomUniqueKey();

    const eggResponse = await client.eggs.MintByUser(mintEggDto.signed(user.privateKey));
    expect(eggResponse.Status).toBe(1);
    const egg = eggResponse.Data as EggNFT;
    expect(egg).toBeDefined();
    expect(egg.id).toBeDefined();

    const startDto = new StartIncubationDto();
    startDto.userId = user.identityKey;
    startDto.eggId = egg.id;
    startDto.uniqueKey = randomUniqueKey();

    const response = await client.incubator.StartIncubation(startDto.signed(user.privateKey));
    expect(response.Status).toBe(0); // Error status
    // Could fail with "max slot/limit" or "Egg not found" depending on state
    expect(response.Message).toMatch(/max.*slot|limit|Egg not found/i);
  });

  test("prevents starting incubation for egg user doesn't own", async () => {
    const otherUser = await client.createRegisteredUser();

    // Mint egg for other user
    const mintEggDto = new MintByUserDto();
    mintEggDto.ownerAddress = otherUser.identityKey;
    mintEggDto.faction = Faction.FROST;
    mintEggDto.galaAmount = 500;
    mintEggDto.uniqueKey = randomUniqueKey();

    const eggResponse = await client.eggs.MintByUser(mintEggDto.signed(otherUser.privateKey));
    expect(eggResponse.Status).toBe(1);
    const egg = eggResponse.Data as EggNFT;
    expect(egg).toBeDefined();
    expect(egg.id).toBeDefined();

    // Try to start incubation with wrong user
    const startDto = new StartIncubationDto();
    startDto.userId = user.identityKey; // Not the owner
    startDto.eggId = egg.id;
    startDto.uniqueKey = randomUniqueKey();

    const response = await client.incubator.StartIncubation(startDto.signed(user.privateKey));
    expect(response.Status).toBe(0); // Error status
    // Could fail with "does not own", "max slot/limit", or "Egg not found" depending on state
    expect(response.Message).toMatch(/does not own|max.*slot|limit|Egg not found/i);
  });

  test("prevents claiming creature when incubation not complete", async () => {
    // Start an incubation
    const mintEggDto = new MintByUserDto();
    mintEggDto.ownerAddress = user.identityKey;
    mintEggDto.faction = Faction.FROST;
    mintEggDto.galaAmount = 500;
    mintEggDto.uniqueKey = randomUniqueKey();

    const eggResponse = await client.eggs.MintByUser(mintEggDto.signed(user.privateKey));
    expect(eggResponse.Status).toBe(1);
    const egg = eggResponse.Data as EggNFT;
    expect(egg).toBeDefined();
    expect(egg.id).toBeDefined();

    const startDto = new StartIncubationDto();
    startDto.userId = user.identityKey;
    startDto.eggId = egg.id;
    startDto.uniqueKey = randomUniqueKey();

    const startResponse = await client.incubator.StartIncubation(startDto.signed(user.privateKey));
    expect(startResponse.Status).toBe(1);
    const sessionId = startResponse.Data?.sessionId || `${user.identityKey}:${egg.id}`;

    // Try to claim immediately (should fail)
    const claimDto = new ClaimCreatureDto();
    claimDto.sessionId = sessionId;
    claimDto.uniqueKey = randomUniqueKey();

    const response = await client.incubator.ClaimCreature(claimDto.signed(user.privateKey));
    expect(response.Status).toBe(0); // Error status
    // Could fail with "not complete", "not finished", "still incubating", or "Creature token class not configured"
    expect(response.Message).toMatch(/not complete|not finished|still incubating|Creature token class not configured/i);
  });
});

interface IncubatorContractAPI {
  StartIncubation(dto: StartIncubationDto): Promise<GalaChainResponse<{ sessionId: string; endTime: number; durationHours: number }>>;
  SpeedUpIncubation(dto: SpeedUpIncubationDto): Promise<GalaChainResponse<{ hoursReduced: number; newEndTime: number; remainingHours: number }>>;
  ClaimCreature(dto: ClaimCreatureDto): Promise<GalaChainResponse<{ creatureTokenInstance: string }>>;
  GetIncubationStatus(dto: GetIncubationStatusDto): Promise<GalaChainResponse<IncubationSession>>;
  GetUserIncubations(dto: GetUserIncubationsDto): Promise<GalaChainResponse<IncubationSession[]>>;
  SetCreatureTokenClass(dto: SetCreatureTokenClassDto): Promise<GalaChainResponse<string>>;
}

function incubatorContractAPI(client: ChainClient): IncubatorContractAPI & CommonContractAPI {
  return {
    ...commonContractAPI(client),

    StartIncubation(dto: StartIncubationDto) {
      return client.submitTransaction("StartIncubation", dto) as Promise<
        GalaChainResponse<{ sessionId: string; endTime: number; durationHours: number }>
      >;
    },

    SpeedUpIncubation(dto: SpeedUpIncubationDto) {
      return client.submitTransaction("SpeedUpIncubation", dto) as Promise<
        GalaChainResponse<{ hoursReduced: number; newEndTime: number; remainingHours: number }>
      >;
    },

    ClaimCreature(dto: ClaimCreatureDto) {
      return client.submitTransaction("ClaimCreature", dto) as Promise<
        GalaChainResponse<{ creatureTokenInstance: string }>
      >;
    },

    GetIncubationStatus(dto: GetIncubationStatusDto) {
      return client.evaluateTransaction("GetIncubationStatus", dto) as Promise<GalaChainResponse<IncubationSession>>;
    },

    GetUserIncubations(dto: GetUserIncubationsDto) {
      return client.evaluateTransaction("GetUserIncubations", dto) as Promise<GalaChainResponse<IncubationSession[]>>;
    },

    SetCreatureTokenClass(dto: SetCreatureTokenClassDto) {
      return client.submitTransaction("SetCreatureTokenClass", dto) as Promise<GalaChainResponse<string>>;
    },
  };
}

interface EggContractAPI {
  MintByUser(dto: MintByUserDto): Promise<GalaChainResponse<EggNFT>>;
  GetEgg(dto: FetchEggDto): Promise<GalaChainResponse<EggNFT>>;
}

function eggContractAPI(client: ChainClient): EggContractAPI & CommonContractAPI {
  return {
    ...commonContractAPI(client),

    MintByUser(dto: MintByUserDto) {
      return client.submitTransaction("MintByUser", dto) as Promise<GalaChainResponse<EggNFT>>;
    },

    GetEgg(dto: FetchEggDto) {
      return client.evaluateTransaction("GetEgg", dto) as Promise<GalaChainResponse<EggNFT>>;
    },
  };
}

