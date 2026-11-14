import { test, expect } from '@playwright/test'
import { expectAccessible } from './helpers.js'

test.use({ storageState: 'e2e/.auth/admin.json' })

test('admin overview loads with live numbers', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  await expectAccessible(page, 'admin overview')
})

for (const section of ['users', 'companies', 'reports', 'audit', 'settings']) {
  test(`admin ${section} loads and is accessible`, async ({ page }) => {
    await page.goto(`/admin/${section}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByText(/couldn’t load|something went wrong/i)).toHaveCount(0)
    await expectAccessible(page, `admin ${section}`)
  })
}

test('moderation queue loads and is accessible', async ({ page }) => {
  await page.goto('/mod')
  await expect(page.getByRole('tab', { name: /Open/ })).toBeVisible()
  await expectAccessible(page, 'moderation')
})
