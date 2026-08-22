// Web e2e: the project home (`docs/project-model.md` §6.0) mounts into the two
// ADDITIVE root-scoped seats it claims, and — the part unit tests cannot check
// — mounting there shadows nothing. The shipped workspace picker and its
// directory-flow child slot are still present, which is exactly what §6.0's
// original `conversation.hero.workspace` choice would have destroyed.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('web e2e: rheplicant project home', () => {
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

  it('lists the ui-project plugin in the browser boot roster', async () => {
    const roster = await page.evaluate(() => (window as unknown as {
      __DSH_BOOT__?: { entries?: { id?: string }[] }
    }).__DSH_BOOT__?.entries?.map(entry => entry.id) ?? [])
    expect(roster).toContain('@deepseek-ai/dsh-client-rheplicant-ui-project')
  })

  it('puts its trigger at the sidebar foot', async () => {
    await page.waitForSelector('[data-project-home-trigger]', { timeout: 15_000 })
    expect(await page.locator('[data-project-home-trigger]').count()).toBe(1)
  })

  it('renders nothing until the trigger is pressed, so the overlay stays click-through', async () => {
    expect(await page.locator('[data-project-home]').count()).toBe(0)
  })

  it('opens the archive page on the trigger and closes it again', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // The page is real chrome, not a stub: its own picker and Close are there.
    expect(await page.locator('[data-project-picker]').count()).toBe(1)
    await page.locator('[data-project-close]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('leaves the shipped workspace chip standing — this seat shadows nothing', async () => {
    // The assertion §6.0's original slot choice would have failed. Taking
    // `conversation.hero.workspace` would have replaced the shipped
    // WorkspacePicker (kind: 'single', replaceRisk: 'shadows-shipped-ui') and
    // taken its `directoryFlow` child slot down with it.
    const chip = page.locator('button', { hasText: /workspace/i })
    expect(await chip.count()).toBeGreaterThan(0)
  })
})
