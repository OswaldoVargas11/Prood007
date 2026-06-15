const preset = require('@legalflow/config/eslint-preset');

module.exports = [
  ...preset,
  { ignores: ['dist/**', 'node_modules/**'] },
];
