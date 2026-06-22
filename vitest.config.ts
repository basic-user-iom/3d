import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/render-graph/tests/**',
      'e2e/**'
    ],
    coverage: {
      provider: 'v8',
      enabled: false
    }
  }
})





