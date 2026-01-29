import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  pnpm: true,
  formatters: true,
  rules: {
    'node/prefer-global/process': 'off',
    'no-console': 'off',
    'style/max-statements-per-line': 'off',
    'ts/explicit-function-return-type': 'off',
  },
})
