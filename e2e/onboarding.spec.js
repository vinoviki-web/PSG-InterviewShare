import { test, expect } from '@playwright/test'
import { signInUI, expectAccessible } from './helpers.js'

test('a new PSG student signs in with an emailed code, onboards and lands on Home', async ({ page }) => {
  const local = `e2e${Date.now().toString(36)}`
  await signInUI(page, local)
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await expectAccessible(page, 'onboarding')

  await page.getByLabel('Full name').fill('Playwright Student')
  await page.getByRole('combobox', { name: 'Department' }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('combobox', { name: 'Batch (graduation year)' }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'What are you preparing for?' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()

  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Playwright')
})
