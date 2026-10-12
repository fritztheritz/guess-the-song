import { defineConfig } from '@playwright/test'

// Browser smoke tests: build the app, serve it the way Pages does, and play through the core flows.
// Run with `npm run e2e` (first time: `npx playwright install chromium`).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173/guess-the-song/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/guess-the-song/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
