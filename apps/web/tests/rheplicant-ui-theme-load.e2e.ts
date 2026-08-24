// Web e2e scenario: the rheplicant theme applies its token OVERRIDE layer
// (`ctx.theme.overrideTokens`) over whichever base theme is active, rather
// than registering and force-selecting its own always-dark theme. With the
// default `system` preference, the resolved scheme follows the OS/browser
// `prefers-color-scheme` media query, so the rheplicant tokens are now
// scheme-aware too: light values (upstream rheplicant GUI workbench) and
// dark values (the deep-space navy console signature) both apply, chosen by
// the same media query the base theme itself reads.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RHEPLICANT_ANCHOR, RHEPLICANT_OVERLAY } from './rheplicant-fixtures.ts'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

interface ThemeTokenState {
  readonly brand: string
  readonly bg: string
  readonly sidebar: string
}

describe('web e2e: rheplicant scheme-aware theme applies its tokens', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: RHEPLICANT_OVERLAY, installAnchor: RHEPLICANT_ANCHOR })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    // Explicit rather than relying on Playwright's own light default: the
    // preference is `system`, so the resolved scheme follows this media
    // query, and the first assertion below depends on it reading light.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  // The theme presenter writes alias tokens as inline CSS vars on body.
  async function readTokens(): Promise<ThemeTokenState> {
    return await page.evaluate(() => ({
      brand: document.body.style.getPropertyValue('--dsw-alias-brand-primary'),
      bg: document.body.style.getPropertyValue('--dsw-alias-bg-base'),
      sidebar: document.body.style.getPropertyValue('--dsw-specific-sidebar-fill'),
    }))
  }

  it('applies the light-scheme tokens (preference: system, OS: light)', async () => {
    const state = await readTokens()
    console.log('THEME_STATE_LIGHT', JSON.stringify(state))
    expect(state.brand).toBe('#BA7517')
    expect(state.bg).toBe('#f4f6f8')
    expect(state.sidebar).toBe('#eef1f4')
  }, 30_000)

  it('flips to the dark-scheme tokens when the OS preference changes', async () => {
    // The theme service holds a live `(prefers-color-scheme: dark)` media
    // query and republishes on `change` while the preference stays `system`
    // — no page reload needed, just a wait for the presenter's reactive
    // re-apply to land.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => (await readTokens()).bg, { timeout: 5_000 }).toBe('#07131f')
    const state = await readTokens()
    console.log('THEME_STATE_DARK', JSON.stringify(state))
    expect(state.brand).toBe('#E3B341')
    expect(state.bg).toBe('#07131f')
    expect(state.sidebar).toBe('#07131f')
  }, 30_000)
})
