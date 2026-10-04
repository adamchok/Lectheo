import next from 'eslint-config-next'

export default [
  ...next,
  { ignores: ['.next/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
]
