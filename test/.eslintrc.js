module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    mocha: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
  },
  plugins: [
    'no-only-tests',
  ],
  rules: {
    'comma-dangle': [ 'error', 'always-multiline' ],
    'eol-last': 'error',
    'no-only-tests/no-only-tests': process.env.CI ? 'error' : 'off',
    'no-tabs': 'error',
    'no-trailing-spaces': 'error',
    'no-undef-init': 'error',
    'no-unused-expressions': 'error',
    'semi': [ 'error', 'always' ],
  },
};
