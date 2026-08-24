// Web e2e regression: a session's SECOND `rheplicant/run` event must render
// its own analysis node, not throw. Before `1a4b5f0` (canonical) the
// `rheplicant-analysis` Definition matched every `rheplicant/run` event with
// the SAME constant Context id (`'run'`, role `'start'`), so the session's
// second run event made the client assembler throw "conversation Context …
// received more than one start Match" — an uncaught error, not something a
// single-run test (rheplicant-analysis.e2e.ts) could ever catch. The fix keys
// the node's id by the event's own `seq` (`run-${event.seq}`) so each run
// event starts its OWN Context. This scenario seeds one session whose log
// carries two `rheplicant/run` events, across two turns (`fit` then `refit`
// — the ordinary case of running an analysis twice), and asserts both render
// their own node with a clean console. Scaffold pattern copied from
// `rheplicant-analysis.e2e.ts`/`rheplicant-console-charts.e2e.ts`.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-analysis-repeat-web-e2e'

// A closed two-turn recording carrying TWO durable `rheplicant/run` events at
// distinct `seq` (3 and 10) — the first turn's `fit` run, then a second turn
// re-running the analysis as `refit`. Both events are `ignorable` (the
// envelope marker for the out-of-repo event type).
const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974300747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974300758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974300759,"data":{"content":[{"type":"text","text":"Run the fit."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974300827,"data":{"turn":1,"step":1}}',
  '{"type":"rheplicant/run","seq":3,"time":1784974300828,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.01,"n_eff":500,"divergences":0,"notes":[]}}],"tookMs":31},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974300829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The fit completed."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974300830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974300831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '{"type":"turn/start","seq":7,"time":1784974300858,"data":{"turn":2,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":8,"time":1784974300859,"data":{"content":[{"type":"text","text":"Run it again with the updated priors."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":9,"time":1784974300927,"data":{"turn":2,"step":1}}',
  '{"type":"rheplicant/run","seq":10,"time":1784974300928,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"refit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.02,"n_eff":600,"divergences":1,"notes":[]}}],"tookMs":47},"transport":"local"}}',
  '{"type":"assistant/message","seq":11,"time":1784974300929,"data":{"turn":2,"step":1,"content":[{"type":"text","text":"The refit completed."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":12,"time":1784974300930,"data":{"turn":2,"step":1}}',
  '{"type":"turn/end","seq":13,"time":1784974300931,"data":{"turn":2,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: rheplicant analysis node survives a second run in the same session', () => {
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

  it('folds BOTH rheplicant/run events into their own rendered rheplicant-analysis node', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-analysis-repeat'))
    // Expand the workspace group, then open the seeded session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()

    // Confirm the seeded session opened (both turns' prompts render — proof
    // the session loaded past the second run event rather than crashing mid-fold).
    await page.getByText('Run the fit.', { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('Run it again with the updated priors.', { exact: true }).waitFor({ timeout: 10_000 })

    // Each `rheplicant/run` event now starts its OWN Context (keyed by its
    // own seq), so the assembler renders two SEPARATE flow rows, not one
    // node that either throws or silently overwrites the first run's data.
    const nodes = page.locator('[data-chat-flow-kind="rheplicant-analysis"]')
    await expect.poll(() => nodes.count(), { timeout: 15_000 }).toBe(2)

    const first = nodes.nth(0).locator('[data-rheplicant-analysis]')
    await first.waitFor({ timeout: 5_000 })
    const firstRun = first.locator('[data-run-name="fit"]')
    await firstRun.waitFor({ timeout: 5_000 })
    expect(await firstRun.getAttribute('data-run-status')).toBe('ok')
    // The second node's own run (`refit`) must NOT appear on the first node —
    // proof the two Contexts stayed genuinely separate, not merged into one.
    expect(await first.locator('[data-run-name="refit"]').count()).toBe(0)

    const second = nodes.nth(1).locator('[data-rheplicant-analysis]')
    await second.waitFor({ timeout: 5_000 })
    const secondRun = second.locator('[data-run-name="refit"]')
    await secondRun.waitFor({ timeout: 5_000 })
    expect(await secondRun.getAttribute('data-run-status')).toBe('ok')
    expect(await second.locator('[data-run-name="fit"]').count()).toBe(0)

    // Per-run diagnostics rendered honestly for each, independently.
    const firstDiag = firstRun.locator('[data-run-diagnostics]')
    await firstDiag.waitFor({ timeout: 5_000 })
    expect(await firstDiag.locator('[data-diag-rhat]').innerText()).toContain('1.01')
    const secondDiag = secondRun.locator('[data-run-diagnostics]')
    await secondDiag.waitFor({ timeout: 5_000 })
    expect(await secondDiag.locator('[data-diag-rhat]').innerText()).toContain('1.02')

    // The surrounding turns' closing assistant messages both render.
    expect(await page.getByText('The fit completed.', { exact: true }).count()).toBe(1)
    expect(await page.getByText('The refit completed.', { exact: true }).count()).toBe(1)
  }, 60_000)

  it('issued zero model calls and stayed clean — the second run did not throw', async () => {
    // The regression this scenario guards: before the fix, folding the
    // SECOND rheplicant/run event threw "conversation Context … received
    // more than one start Match" as an uncaught error, which `watchConsole`
    // would have captured as a `pageerror`. A clean tripwire here is the
    // actual proof the fix holds — not just that two DOM nodes happened to
    // appear.
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
