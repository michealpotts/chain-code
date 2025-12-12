
import {
  BurnTokensDto,
  ChainUser,
  FetchBalancesDto,
  TokenBalance,
  TokenBurn,
  TokenClassKey,
  TokenInstanceKey,
  createValidDTO,
  createValidSubmitDTO
} from "@gala-chain/api";
import {
  AdminChainClients,
  TestClients,
  mintTokensToUsers,
  randomize,
  transactionSuccess
} from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { instanceToPlain, plainToInstance } from "class-transformer";

jest.setTimeout(30000);

describe("NFT Burn scenario", () => {
  let client: AdminChainClients;
  let user1: ChainUser;
  let user2: ChainUser;

  const nftClassKey: TokenClassKey = plainToInstance(TokenClassKey, {
    collection: randomize("NFT").slice(0, 20),
    category: "Weapon",
    type: "Axe",
    additionalKey: "none"
  });

  beforeAll(async () => {
    client = await TestClients.createForAdmin();
    user1 = await client.createRegisteredUser();
    user2 = await client.createRegisteredUser();

    await mintTokensToUsers(client.assets, nftClassKey, [
      { user: user1, quantity: new BigNumber(1) },
      { user: user2, quantity: new BigNumber(1) }
    ]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("User should burn tokens", async () => {
    // Given
    const burnTokensDto = await createValidSubmitDTO(BurnTokensDto, {
      tokenInstances: [
        {
          tokenInstanceKey: TokenInstanceKey.nftKey(nftClassKey, 1),
          quantity: new BigNumber(1)
        }
      ]
    });

    // When
    const burnTokenResponse = await client.assets.submitTransaction<TokenBurn[]>(
      "BurnTokens",
      burnTokensDto.signed(user1.privateKey),
      TokenBurn
    );

    // Then
    expect(burnTokenResponse).toEqual(transactionSuccess());
  });

  it("Should confirm token burn was successful", async () => {
    // Given
    const user1TokenInstances = await createValidDTO(FetchBalancesDto, {
      owner: user1.identityKey,
      ...instanceToPlain(nftClassKey)
    });

    // When
    const user1checkResponse = await client.assets.evaluateTransaction(
      "FetchBalances",
      user1TokenInstances,
      TokenBalance
    );

    // Then
    expect((user1checkResponse.Data ?? [])[0].instanceIds).toEqual([]);
  });
});
