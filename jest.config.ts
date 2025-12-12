// use role-based access control (RBAC) for tests.
process.env.USE_RBAC = "true";

export default {
  displayName: "chaincode-template",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }]
  },
  moduleFileExtensions: ["ts", "js"],
  transformIgnorePatterns: ["/node_modules/", ".*/lib/.*"],
  modulePathIgnorePatterns: ["lib", "e2e"]
};
