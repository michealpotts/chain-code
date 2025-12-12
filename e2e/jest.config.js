

require("dotenv/config"); // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import

if (process.env.GALA_NETWORK_ROOT_PATH === undefined) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  const networkRoot = path.resolve(__dirname, "../test-network");
  process.env.GALA_NETWORK_ROOT_PATH = networkRoot;
}

// Force less information in logs.
// We want this, because while running tests from command line Fabric produces
// a lot of logs, and it's hard to see the actual test output.
// Also, we need to add it in Jest config file, to change it early enough, since
// the log level for chaincodes is configured during import resolution.
process.env.CORE_CHAINCODE_LOGGING_LEVEL = "error";
process.env.LOG_LEVEL = "error";

// Use role-based access control (RBAC) for tests.
process.env.USE_RBAC = "true";

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node"
};
