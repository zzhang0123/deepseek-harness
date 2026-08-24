// Web e2e: what the rheplicant console tab IS after §20.4 — the project header
// naming which execution this conversation is on, and the activity rail naming
// what it has done. Nothing else.
//
// **This file used to assert a `console.panel` grid** and, in a second
// scenario, a per-session panel-layout store (collapse, hide, persist across
// reload, reset). §20.4 removed both: the same six occupants were registered
// twice, here and in the workbench, and the pair was already drifting. The
// panels are the project surface's alone now, and so is the layout that
// governs them — `rheplicant-ui-project-home.e2e.ts` carries the layout
// scenario, and the chart rendering moved to jsdom specs beside the components
// (see `rheplicant-console-charts.e2e.ts`'s header for the full map).
//
// The assertions that the grid is GONE are kept deliberately: a slot
// declaration is cheap to re-add by accident, and a second seat is exactly
// what this change exists to prevent.
//
// The console tab only renders once a session is open, so the scenario seeds
// and opens one first.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-ui-console-web-e2e'

// A closed single-turn recording carrying one durable `rheplicant/run` event
// whose outcome has three runs: a `fit` run with per-latent `chains` (posterior
// corner), an `mmode` run with a `spectrum` grid, and an `ident` run with
// rank/nullity/singular_values diagnostics. The event is marked `ignorable`
// (the envelope marker for the out-of-repo event type).
const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974100747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974100758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974100759,"data":{"content":[{"type":"text","text":"Open the console view."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974100827,"data":{"turn":1,"step":1}}',
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.002,"n_eff":1327,"divergences":0,"notes":[]},"chains":{"g":[1.0,1.1,1.2,1.05,1.08,1.15],"amp":[0.5,0.51,0.49,0.52,0.5,0.5]}},{"name":"mmode","kind":"mmodes","status":"ok","spectrum":[[0,1,2,3,4],[1,2,3,4,5],[2,3,4,5,6],[3,4,5,6,7],[4,5,6,7,8]]},{"name":"ident","kind":"identifiability","status":"ok","diagnostics":{"rank":6,"nullity":0,"singular_values":[10,8,5,3,1],"notes":[]}}],"tookMs":42},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974100829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The console view is ready."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974100830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974100831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: the rheplicant console tab', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ ...rheplicantFixtures() })
    await seedSession(scaffold, realizeSeedFixture(scaffold, SEED_FIXTURE, SEED_ID), SEED_ID)
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

  it('renders the project header and this conversation\'s activity rail', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-ui-console'))

    // Open the seeded session: expand the workspace group, then click the session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await page.getByText('Open the console view.', { exact: true }).waitFor({ timeout: 10_000 })

    await page.getByRole('tab', { name: 'Console', exact: true }).click()
    const consoleView = page.locator('[data-rheplicant-console]')
    await consoleView.waitFor({ timeout: 15_000 })
    expect(await consoleView.count()).toBe(1)

    // The activity strip, and its label — which is load-bearing (§11.4): an
    // unlabelled rail reads as a statement about the TASK, and this one is a
    // statement about the CONVERSATION.
    const activity = consoleView.locator('[data-session-activity]')
    await activity.waitFor({ timeout: 10_000 })
    expect((await activity.innerText()).toLowerCase()).toContain('in this conversation')
    await activity.locator('[data-loop-rail]').waitFor({ timeout: 10_000 })
  }, 60_000)

  it('carries no panel grid, no Panels menu, and no panel of its own (§20.4)', async () => {
    // The regression guard for the whole change: one seat for a panel, not two.
    expect(await page.locator('[data-console-grid]').count()).toBe(0)
    expect(await page.locator('[data-panels-menu]').count()).toBe(0)
    for (const id of ['gates', 'posterior', 'chains', 'signal-path', 'identifiability', 'spectrum', 'document']) {
      expect(await page.locator(`[data-panel="${id}"]`).count(), `panel ${id}`).toBe(0)
    }
  })

  it('keeps the Document TAB, which is where that fold lives now', async () => {
    // ui-document's `console.panel` occupant went with the grid. Nothing was
    // lost: the tab below is the same fold, with the grammar reference beside
    // it — so this asserts the replacement exists, not merely that the panel
    // is gone.
    await page.getByRole('tab', { name: 'Document', exact: true }).click()
    await page.locator('[data-rheplicant-document]').waitFor({ timeout: 15_000 })
  })

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
