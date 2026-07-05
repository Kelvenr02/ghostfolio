/* eslint-disable */

// Run tests in UTC for deterministic date-based calculations
process.env.TZ = 'UTC';

export default {
  displayName: 'api',

  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  testEnvironment: 'node',
  // Smoke tests live (validação B3/BRL) só rodam via `nx run api:test-live`
  testPathIgnorePatterns: ['/node_modules/', '\\.live-spec\\.ts$'],
  preset: '../../jest.preset.js'
};
