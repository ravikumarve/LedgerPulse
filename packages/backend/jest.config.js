/** @type {import("jest").Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};

module.exports = config;
