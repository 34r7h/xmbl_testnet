export default {
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleDirectories: ['node_modules'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^libp2p$': '<rootDir>/node_modules/libp2p/src/index.js'
  },
  resolver: 'jest-node-exports-resolver',
};