import { defineConfig } from '@playwright/test'

// Browser tests: build the app, serve it the way Pages does, and drive it.
//  - `smoke` plays through the core flows (runs in CI):            npm run e2e
//  - `visual` compares key screens to committed screenshots:       npm run e2e:visual
//    (kept out of CI — pixel output differs between macOS and Linux fonts, so the baselines are
//    made and checked on the same machine. Refresh them after an intended UI change with
//    `npm run e2e:visual:update`.)
// First time: `npx playwright install chromium`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: { baseURL: 'http://127.0.0.1:4173/guess-the-song/', trace: 'retain-on-failure' },
  projects: [
    { name: 'smoke', testIgnore: /visual\.spec/ },
    { name: 'visual', testMatch: /visual\.spec/ },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/guess-the-song/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
