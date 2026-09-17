import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/*.{test,spec}.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000
        }
      }
    ]
  }
})
