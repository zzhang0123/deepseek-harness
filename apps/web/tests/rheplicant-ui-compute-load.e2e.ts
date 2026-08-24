// Web e2e: the ui-compute client bundle is served and registered in the
// browser roster alongside the other rheplicant client plugins.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('web e2e: rheplicant ui-compute bundle loads', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ ...rheplicantFixtures() })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('lists the ui-compute plugin in the browser boot roster', async () => {
    const roster = await page.evaluate(() => (window as unknown as {
      __DSH_BOOT__?: { entries?: { id?: string }[] }
    }).__DSH_BOOT__?.entries?.map(entry => entry.id) ?? [])
    expect(roster).toContain('@deepseek-ai/dsh-client-rheplicant-ui-compute')
  })
})
