import { test as setup, expect } from '@playwright/test'
import { signInUI } from './helpers.js'

// Seeded local demo accounts (supabase/seed.sql). Signed in once, reused by every spec.
for (const [who, local] of [['student', '22z201'], ['admin', '22e646']]) {
  setup(`sign in as ${who}`, async ({ page }) => {
    setup.setTimeout(120_000)
    await signInUI(page, local)
    await expect(page).toHaveURL(/\/home$/)
    await page.context().storageState({ path: `e2e/.auth/${who}.json` })
  })
}
