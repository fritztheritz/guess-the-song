import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// Base path matches the GitHub Pages project URL (https://<user>.github.io/guess-the-song/).
// Override with VITE_BASE for a custom domain or user/org page ("/").
export default defineConfig({
  base: process.env.VITE_BASE ?? '/guess-the-song/',
  plugins: [react(), tailwindcss()],
  // Playwright specs live in e2e/ and run with `npm run e2e`, not under vitest.
  test: { exclude: ['e2e/**', '**/node_modules/**', 'dist/**'] },
})
