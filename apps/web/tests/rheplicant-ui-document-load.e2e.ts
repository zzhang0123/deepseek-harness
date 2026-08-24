// Web e2e: the ui-document client bundle is served and registered in the
// browser roster alongside the other rheplicant client plugins, and the
// Document TAB renders the exact recorded document plus the generated grammar
// reference from one seeded `rheplicant/run` event. Its `console.panel`
// occupant went with the console's grid (§20.4) — the last assertion checks
// it is gone, and that the tab it duplicated is still here.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

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

  it('lists the ui-document plugin in the browser boot roster', async () => {
    const roster = await page.evaluate(() => (window as unknown as {
      __DSH_BOOT__?: { entries?: { id?: string }[] }
    }).__DSH_BOOT__?.entries?.map(entry => entry.id) ?? [])
    expect(roster).toContain('@deepseek-ai/dsh-client-rheplicant-ui-document')
  })
})

const DOCUMENT_SEED_ID = 'rheplicant-ui-document-render-web-e2e'

// The document reused as the event's `document` payload: a distinctive,
// recognizable key (`global_signal`) that the hand-rolled YAML emitter must
// render verbatim, so the assertion below proves the exact document renders
// rather than a placeholder or a re-derived summary.
const DOCUMENT = {
  model: { global_signal: { depth: 0.1, centre: 75e6, width: 5e6 } },
  runtime: { seed: 7 },
  runs: [{ name: 'fit', kind: 'nuts' }],
}

// A closed single-turn recording carrying one durable `rheplicant/run` event
// whose `document` is the object above. `ignorable: true` is the envelope
// marker for the out-of-repo event type (see rheplicant-console-loop.e2e.ts).
const DOCUMENT_SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974400747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974400758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974400759,"data":{"content":[{"type":"text","text":"Open the document view."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974400827,"data":{"turn":1,"step":1}}',
  `{"type":"rheplicant/run","seq":3,"time":1784974400828,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok"}],"tookMs":19}}}`,
  '{"type":"assistant/message","seq":4,"time":1784974400829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The document view is ready."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974400830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974400831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: rheplicant Document view renders the exact document + grammar reference', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ ...rheplicantFixtures() })
    await seedSession(scaffold, realizeSeedFixture(scaffold, DOCUMENT_SEED_FIXTURE, DOCUMENT_SEED_ID), DOCUMENT_SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the exact document, its source caption, the grammar reference, and the console panel occupant', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-ui-document-render'))

    // Open the seeded session: expand the workspace group, then click the session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()

    // Confirm the seeded session opened (its user prompt renders).
    await page.getByText('Open the document view.', { exact: true }).waitFor({ timeout: 10_000 })

    // --- The Document view is a conversation.view tab; select it. ---
    await page.getByRole('tab', { name: 'Document', exact: true }).click()

    const view = page.locator('[data-rheplicant-document]')
    await view.waitFor({ timeout: 15_000 })

    // The exact document, verbatim: a recognizable key from the seeded
    // document renders in the code block, not a placeholder or a re-derived
    // summary.
    const text = view.locator('[data-document-text]')
    await text.waitFor({ timeout: 10_000 })
    expect(await text.innerText()).toContain('global_signal')

    // The caption names the source event and its transport.
    const source = view.locator('[data-document-source]')
    await source.waitFor({ timeout: 5_000 })
    expect(await source.getAttribute('data-source-kind')).toBe('run')
    expect(await source.getAttribute('data-transport')).toBe('local')
    expect(await source.innerText()).toContain('rheplicant/run')
    expect(await source.innerText()).toContain('local transport')

    // The grammar reference renders `[data-section]` rows, including a
    // required one (`runtime` — schema.ts's generated `sections` list).
    const grammar = view.locator('[data-document-grammar]')
    await grammar.waitFor({ timeout: 5_000 })
    const requiredSection = grammar.locator('[data-section="runtime"]')
    await requiredSection.waitFor({ timeout: 5_000 })
    expect(await requiredSection.getAttribute('data-required')).toBe('true')
    // An optional section is present too, and marked as such.
    const optionalSection = grammar.locator('[data-section="resources"]')
    await optionalSection.waitFor({ timeout: 5_000 })
    expect(await optionalSection.getAttribute('data-required')).toBe('false')

    // --- This package's `console.panel` occupant is GONE with the grid it
    // sat in (§20.4), and nothing was lost: it rendered the exact document
    // alone, which is the first half of the tab asserted above. ---
    await page.getByRole('tab', { name: 'Console', exact: true }).click()
    const consoleView = page.locator('[data-rheplicant-console]')
    await consoleView.waitFor({ timeout: 15_000 })
    expect(await page.locator('[data-panel="document"]').count()).toBe(0)
    expect(await page.locator('[data-console-grid]').count()).toBe(0)
  }, 60_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
