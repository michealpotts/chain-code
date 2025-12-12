
import { PublicKeyContract } from "@gala-chain/chaincode";
import { fixture, transactionSuccess } from "@gala-chain/test";

// The purpose of this test is to detect unexpected changes in API definition
test(`${PublicKeyContract.name} API should match snapshot`, async () => {
  // Given
  const { contract, ctx } = fixture(PublicKeyContract);

  // When
  const contractApi = await contract.GetContractAPI(ctx);

  // Then
  expect(contractApi).toEqual(transactionSuccess());
  expect({
    ...contractApi.Data,
    contractVersion: "?.?.?",
    channelId: "channel-id",
    chaincodeId: "chaincode-id"
  }).toMatchSnapshot();
});
