// @ts-check

module.exports = {
  preset: 'ts-jest',
  testMatch: ['**/__tests__/**/?(*.)+(spec|test).[jt]s?(x)'],
  testEnvironment: 'node',
  transform: {
    '\\.(gql|graphql)$': 'jest-transform-graphql',
  },
}
