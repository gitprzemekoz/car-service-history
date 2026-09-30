// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // @stryker-mutator/vitest-runner 10.0.0 does not activate mutants under Vitest 5 (every mutant survives),
  // so run the suite as a plain command; Stryker selects the mutant via the __STRYKER_ACTIVE_MUTANT__ env var.
  testRunner: "command",
  commandRunner: {
    command: "npx vitest run",
  },
  // Only src/lib has unit tests (see vitest.config.ts include); mutating untested code just produces survivors.
  mutate: ["src/lib/**/*.ts", "!src/lib/**/*.test.ts"],
  reporters: ["clear-text", "progress", "html"],
  // The command runner cannot report per-test coverage.
  coverageAnalysis: "off",
  // Each mutant spawns a full Vitest process (~2s); the default concurrency (CPUs - 1) starves them
  // and turns most mutants into false "Timeout" results, which Stryker counts as detected.
  concurrency: 4,
  timeoutMS: 30000,
};
