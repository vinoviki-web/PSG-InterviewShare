import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/student.json' })

for (const path of ['/home', '/experiences', '/companies', '/share']) {
  test(`${path} fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
