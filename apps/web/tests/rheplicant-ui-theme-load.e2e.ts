// Web e2e scenario: the rheplicant dark theme registers and applies its
// token overrides. The `ui-theme-rheplicant` plugin registers a `rheplicant`
// theme and selects it as default, so the booted page body must carry the
// dark-scheme attribute and the amber brand token.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('web e2e: rheplicant dark theme applies its tokens', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('applies the dark scheme and the amber brand token', async () => {
    // The theme presenter writes alias tokens as inline CSS vars on body and
    // flags the dark base palette.
    const state = await page.evaluate(() => ({
      brand: document.body.style.getPropertyValue('--dsw-alias-brand-primary'),
      bg: document.body.style.getPropertyValue('--dsw-alias-bg-base'),
      sidebar: document.body.style.getPropertyValue('--dsw-specific-sidebar-fill'),
    }))
    console.log('THEME_STATE', JSON.stringify(state))
    expect(state.brand).toBe('#F2A93B')
    expect(state.bg).toBe('#07131f')
    expect(state.sidebar).toBe('#07131f')
  }, 30_000)
})
