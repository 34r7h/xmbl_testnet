export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/integration/**/*.test.js'],
  collectCoverageFrom: [
    '**/src/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  testTimeout: 30000,
  maxWorkers: 1 // Run integration tests sequentially to avoid port conflicts
};



