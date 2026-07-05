export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.js'],
  // Run serially: several suites are LevelDB-backed and some share a db path
  // (e.g. ledger.test's default ./data/ledger), so parallel workers contend on
  // the LevelDB LOCK and intermittently fail. Serial execution is deterministic
  // and mirrors the root integration config, which runs sequentially for the
  // same reason. Total runtime stays modest (~15-20s).
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ]
};

