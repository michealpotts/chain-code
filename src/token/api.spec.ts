
import { fixture } from "@gala-chain/test";

import GalaChainTokenContract from "./GalaChainTokenContract";

// The purpose of this test is to detect unexpected changes in API definition
test(`${GalaChainTokenContract.name} API should match snapshot`, async () => {
  // Given
  const { contract, ctx } = fixture(GalaChainTokenContract);

  // When
  const contractApi = await contract.GetContractAPI(ctx);

  // Then
  const methodNames = (contractApi.Data?.methods ?? []).map((m) => m.methodName);
  expect(methodNames).toContain("CreateTokenClass"); // method from contract
  expect(methodNames).toContain("GetContractVersion"); // method from parent
  expect(methodNames).not.toContain("GetPublicKey"); // method from other contract
  expect({
    ...contractApi.Data,
    contractVersion: "?.?.?",
    channelId: "channel-id",
    chaincodeId: "chaincode-id"
  }).toMatchSnapshot();
});
