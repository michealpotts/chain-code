
import { execSync } from "child_process";

jest.setTimeout(30000);

it("should expose contract names", async () => {
  // Given
  const cliPath = require.resolve(`../lib/src/cli.js`);

  const expectedContracts = [
    { contractName: "CreatureContract" },
    { contractName: "EggContract" },
    { contractName: "GalaChainToken" },
    { contractName: "IncubatorContract" },
    { contractName: "PublicKeyContract" },
    { contractName: "SoulContract" }
  ];

  // When
  const response = execSync(`node ${cliPath} get-contract-names`).toString().trim();

  // Then
  const lastLine = response.split("\n").pop();
  expect(lastLine).toEqual(JSON.stringify(expectedContracts));

  // Optional check for grpc version conflicts
  expect(response).toContain("No conflicting versions of @grpc/grpc-js detected.");
});
