import { test, expect } from '@playwright/test'
import { expectAccessible } from './helpers.js'

test.use({ storageState: 'e2e/.auth/student.json' })

test('home greets the student', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Arjun')
  await expectAccessible(page, 'home')
})

test('explore → search → read an experience', async ({ page }) => {
  await page.goto('/experiences')
  await expect(page.getByRole('heading', { name: 'Explore experiences' })).toBeVisible()
  await expectAccessible(page, 'explore')
  const first = page.locator('main a[href^="/experiences/"]').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'experience detail')
})

test('explore can be narrowed to one domain', async ({ page }) => {
  await page.goto('/experiences')
  await page.getByRole('group', { name: 'Filter by domain' }).getByRole('button', { name: /Electrical/ }).click()
  await expect(page).toHaveURL(/domain=electrical/)
  const cards = page.locator('main article')
  await expect(cards.first()).toBeVisible()
  // The previous (unfiltered) page stays on screen until the new results arrive
  await expect.poll(() => cards.filter({ hasNot: page.getByText('Electrical', { exact: true }) }).count(), { timeout: 10_000 }).toBe(0)
  await expectAccessible(page, 'explore (electrical)')
})

test('the share form asks for the domain and adapts its examples', async ({ page }) => {
  await page.goto('/share')
  const fresh = page.getByRole('button', { name: /start (a )?new|new experience/i })
  if (await fresh.first().isVisible().catch(() => false)) await fresh.first().click()
  const domain = page.getByRole('radiogroup', { name: 'Domain' })
  await expect(domain.getByRole('radio')).toHaveCount(13)
  await domain.getByRole('radio', { name: /Electrical/ }).click()
  await expect(page.locator('p[aria-live]').getByText('Machines, power systems, power electronics, EV')).toBeVisible()
  await expect(page.getByLabel('Role title')).toHaveAttribute('placeholder', 'e.g. Graduate Engineer Trainee')
  await expectAccessible(page, 'share basics (domain chosen)')
})

test('companies directory and a company page', async ({ page }) => {
  await page.goto('/companies')
  await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible()
  await expectAccessible(page, 'companies')
  await page.locator('main a[href^="/companies/"]').first().click()
  await expect(page).toHaveURL(/\/companies\/[a-z0-9-]+/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'company page')
})

for (const [path, name] of [['/me', 'profile'], ['/saved', 'saved'], ['/settings', 'settings'], ['/share', 'share']]) {
  test(`${name} page loads and is accessible`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectAccessible(page, name)
  })
}

test('students cannot open moderation or admin', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText('This area is for admins')).toBeVisible()
  await page.goto('/mod')
  await expect(page.getByText('This area is for moderators')).toBeVisible()
})
