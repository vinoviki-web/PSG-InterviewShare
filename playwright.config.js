import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end and accessibility tests (Phase 10). They drive the REAL app in
 * database mode against the local Supabase stack, signing in with codes read
 * from the local mail catcher. Start the stack first: `npm run db:start`.
 */
const PORT = 5175
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one shared database and per-email rate limits
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // Uses the installed Google Chrome (no browser download needed).
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', channel: 'chrome' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' }, dependencies: ['setup'] },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, dependencies: ['setup'], testMatch: /mobile\.spec\.js/ },
  ],
  webServer: {
    command: `npx vite --mode db --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
