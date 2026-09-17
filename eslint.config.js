import antfu from '@antfu/eslint-config'

export default antfu({
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false
  },
  typescript: true,
  vue: true,
  jsonc: false,
  yaml: false,
  rules: {
    'style/comma-dangle': ['error', 'never'],
    'style/brace-style': ['error', '1tbs'],
    'node/prefer-global/process': ['off'],
    'no-console': ['error', { allow: ['log', 'debug', 'assert'] }]
  }
})
