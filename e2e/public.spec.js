import { test, expect } from '@playwright/test'
import { expectAccessible } from './helpers.js'

test.describe('visitors', () => {
  test('landing page explains the product and links to sign in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page, 'landing')
  })

  test('member pages send visitors to sign in and come back afterwards', async ({ page }) => {
    await page.goto('/experiences')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Sign in with your college email' })).toBeVisible()
    await expectAccessible(page, 'login')
  })

  test('only PSG college email addresses are accepted', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('College email').fill('someone@gmail.com')
    await page.getByRole('button', { name: 'Send code' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toHaveCount(0)
    await expect(page.getByText(/psgtech\.ac\.in/).first()).toBeVisible()
  })

  for (const path of ['/about', '/guidelines', '/privacy', '/terms']) {
    test(`static page ${path} is readable and accessible`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectAccessible(page, path)
    })
  }

  test('unknown pages show a friendly not-found page', async ({ page }) => {
    await page.goto('/this-does-not-exist')
    await expect(page).toHaveURL(/\/login|this-does-not-exist/)
  })
})
