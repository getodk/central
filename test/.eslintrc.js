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
  rules: {
    'eol-last': 'error',
    'no-tabs': 'error',
    'no-trailing-spaces': 'error',
    'no-undef-init': 'error',
    'no-unused-expressions': 'error',
    'semi': [ 'error', 'always' ],
  },
};
