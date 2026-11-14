import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

/** Reads the newest 6-digit sign-in code sent to `email` after `after`. */
export async function codeFor(email, after) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages = [] } = await res.json()
    const fresh = messages.filter((m) => new Date(m.Created) >= after)
    if (fresh.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json()
      const code = (msg.Text ?? '').match(/\b(\d{6})\b/)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No sign-in code arrived for ${email}`)
}

/**
 * Signs in through the real UI: email → emailed code. Auth allows one code per
 * address every 30 seconds, so if another suite just signed this account in,
 * wait out the limit and try again.
 */
export async function signInUI(page, local) {
  const email = `${local}@psgtech.ac.in`
  const checkEmail = page.getByRole('heading', { name: 'Check your email' })
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/login')
    const after = new Date(Date.now() - 2000)
    await page.getByLabel('College email').fill(local)
    await page.getByRole('button', { name: 'Send code' }).click()
    if (await checkEmail.waitFor({ timeout: 6_000 }).then(() => true, () => false)) {
      await page.getByLabel('6-digit code').fill(await codeFor(email, after))
      return
    }
    await page.waitForTimeout(31_000)
  }
  throw new Error(`Could not request a sign-in code for ${email}`)
}

/** Fails with a readable list if axe finds WCAG 2.1 A/AA violations. */
export async function expectAccessible(page, name) {
  await page.waitForLoadState('networkidle')
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(summary, `${name}: accessibility violations`).toEqual([])
}
