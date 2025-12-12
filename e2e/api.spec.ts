
import { commonContractAPI } from "@gala-chain/api";
import { AdminChainClients, TestClients, transactionSuccess } from "@gala-chain/test";

jest.setTimeout(30000);

describe("API snapshots", () => {
  const contractConfig = {
    assets: {
      channel: "product-channel",
      chaincode: "basic-product",
      contract: "GalaChainToken",
      api: commonContractAPI
    },
    pk: {
      channel: "product-channel",
      chaincode: "basic-product",
      contract: "PublicKeyContract",
      api: commonContractAPI
    }
  };

  let client: AdminChainClients<typeof contractConfig>;

  // might be different in different environments
  const apiOverrides: Record<string, unknown> = {
    contractVersion: "?.?.?",
    channelId: "channel-id",
    chaincodeId: "chaincode-id"
  };

  beforeAll(async () => {
    client = await TestClients.createForAdmin(contractConfig);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test(`Api of ${contractConfig.pk.contract}`, async () => {
    // When
    const response = await client.pk.GetContractAPI();

    // Then
    expect(response).toEqual(transactionSuccess());
    expect({ ...response.Data, ...apiOverrides }).toMatchSnapshot();
  });

  test(`Api of ${contractConfig.assets.contract}`, async () => {
    // When
    const response = await client.assets.GetContractAPI();

    // Then
    expect(response).toEqual(transactionSuccess());
    expect({ ...response.Data, ...apiOverrides }).toMatchSnapshot();
  });
});
