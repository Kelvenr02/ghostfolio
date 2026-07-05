/* eslint-disable */

// Run tests in UTC for deterministic date-based calculations
process.env.TZ = 'UTC';

/**
 * Config EXCLUSIVA dos smoke tests live da validação B3/BRL (Módulo 04):
 * arquivos *.live-spec.ts batem na API real do Yahoo para detectar drift do
 * provedor. Opt-in duplo: `nx run api:test-live` + RUN_LIVE_PROVIDER_TESTS=true.
 * O `nx test api` padrão NUNCA roda estes arquivos (testPathIgnorePatterns).
 */
export default {
  displayName: 'api-live',

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
  testEnvironment: 'node',
  testMatch: ['**/*.live-spec.ts'],
  preset: '../../jest.preset.js'
};
