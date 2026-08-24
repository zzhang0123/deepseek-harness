// Web e2e regression: a session that runs the SAME document with the SAME
// seed twice produces two `rheplicant/run` events whose outcomes are
// byte-identical (same run name, kind, status, and diagnostics) — the
// ordinary case of a user re-running an analysis to double-check it, not an
// edge case. Reported bug: the console rendered one card per run, correctly
// (12 `rheplicant/run` events, 12 distinct times, 12 distinct seqs — no
// duplication bug, exactly one append per call), but the cards carried no
// provenance, so genuinely distinct runs read as one chart shown three
// times. The fix: each run card's caption now names its wall-clock time,
// transport, and — the one field guaranteed to differ even inside the same
// wall-clock second — its event's own `seq`. This scenario seeds two
// `rheplicant/run` events with an IDENTICAL `outcome.runs` entry across two
// turns and asserts both cards render with DIFFERING `data-run-provenance`.
// Scaffold pattern copied from `rheplicant-analysis-repeat.e2e.ts` (which
// covers the DIFFERENT-outcome case — two runs named "fit"/"refit" — this
// scenario is deliberately narrower: same name, same everything but seq/time).
//
// Extended for execution identity (`docs/project-model.md` §4.1): the two
// events now also carry an `executionId` and a `taskPath`, and the caption
// must show them. `seq` orders events inside ONE session log and nothing
// more; the execution id is the durable name of the run — the same string
// its results tree on disk is keyed by — so it is what makes two cards
// distinguishable across sessions, not merely within one.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-analysis-provenance-web-e2e'

// The exact same `outcome.runs` entry, verbatim, in both `rheplicant/run`
// events below — only the surrounding event's `seq`/`time` differ (3/10,
// naturally distinct — every durable event carries its own).
const IDENTICAL_OUTCOME = '{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.01,"n_eff":500,"divergences":0,"notes":[]}}],"tookMs":31}'

// Two executions of ONE task file, in the same wall-clock second: identical
// timestamp segment, identical taskDigest segment, different random suffix.
// That suffix is the entire reason the id carries randomness (§4.1).
const FIRST_EXECUTION = '20260822T134501Z-3f9ac2b1-k7m2xq'
const SECOND_EXECUTION = '20260822T134501Z-3f9ac2b1-b4d9tz'
const TASK_PATH = 'tasks/global-signal-fit.yaml'
const TASK_DIGEST = '3f9ac2b1c0de4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f809a1b2c3d'
const IDENTITY_ONE = `"executionId":"${FIRST_EXECUTION}","taskDigest":"${TASK_DIGEST}","taskPath":"${TASK_PATH}"`
const IDENTITY_TWO = `"executionId":"${SECOND_EXECUTION}","taskDigest":"${TASK_DIGEST}","taskPath":"${TASK_PATH}"`

const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974500747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974500758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974500759,"data":{"content":[{"type":"text","text":"Run the fit with seed 1."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974500827,"data":{"turn":1,"step":1}}',
  `{"type":"rheplicant/run","seq":3,"time":1784974500828,"ignorable":true,"data":{"document":{},"outcome":${IDENTICAL_OUTCOME},"transport":"local",${IDENTITY_ONE}}}`,
  '{"type":"assistant/message","seq":4,"time":1784974500829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The fit completed."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974500830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974500831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '{"type":"turn/start","seq":7,"time":1784974500958,"data":{"turn":2,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":8,"time":1784974500959,"data":{"content":[{"type":"text","text":"Run the exact same fit again with seed 1."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":9,"time":1784974501027,"data":{"turn":2,"step":1}}',
  `{"type":"rheplicant/run","seq":10,"time":1784974501028,"ignorable":true,"data":{"document":{},"outcome":${IDENTICAL_OUTCOME},"transport":"local",${IDENTITY_TWO}}}`,
  '{"type":"assistant/message","seq":11,"time":1784974501029,"data":{"turn":2,"step":1,"content":[{"type":"text","text":"The rerun completed — same result, as expected."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":12,"time":1784974501030,"data":{"turn":2,"step":1}}',
  '{"type":"turn/end","seq":13,"time":1784974501031,"data":{"turn":2,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: two byte-identical rheplicant runs still read as distinct cards', () => {
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

  it('renders both identical-outcome runs with differing provenance captions', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-analysis-provenance'))
    // Expand the workspace group, then open the seeded session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()

    // Confirm the seeded session opened (both turns' prompts render).
    await page.getByText('Run the fit with seed 1.', { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('Run the exact same fit again with seed 1.', { exact: true }).waitFor({ timeout: 10_000 })

    // Two SEPARATE analysis nodes — one per `rheplicant/run` event, keyed by
    // its own seq, per the fix `rheplicant-analysis-repeat.e2e.ts` covers.
    const nodes = page.locator('[data-chat-flow-kind="rheplicant-analysis"]')
    await expect.poll(() => nodes.count(), { timeout: 15_000 }).toBe(2)

    const first = nodes.nth(0).locator('[data-rheplicant-analysis]')
    await first.waitFor({ timeout: 5_000 })
    const firstRun = first.locator('[data-run-name="fit"]')
    await firstRun.waitFor({ timeout: 5_000 })

    const second = nodes.nth(1).locator('[data-rheplicant-analysis]')
    await second.waitFor({ timeout: 5_000 })
    const secondRun = second.locator('[data-run-name="fit"]')
    await secondRun.waitFor({ timeout: 5_000 })

    // The outcome really is byte-identical: both runs report the exact same
    // status and r_hat — this is the crux of the bug. Without provenance,
    // nothing else in the DOM would distinguish them.
    expect(await firstRun.getAttribute('data-run-status')).toBe('ok')
    expect(await secondRun.getAttribute('data-run-status')).toBe('ok')
    const firstDiag = firstRun.locator('[data-run-diagnostics]')
    const secondDiag = secondRun.locator('[data-run-diagnostics]')
    await firstDiag.waitFor({ timeout: 5_000 })
    await secondDiag.waitFor({ timeout: 5_000 })
    expect(await firstDiag.locator('[data-diag-rhat]').innerText()).toContain('1.01')
    expect(await secondDiag.locator('[data-diag-rhat]').innerText()).toContain('1.01')

    // The regression check: each run card carries its own provenance
    // caption, and the two DIFFER — seq 3 vs seq 10, the field guaranteed to
    // differ regardless of wall-clock time or transport.
    const firstProvenance = firstRun.locator('[data-run-provenance]')
    const secondProvenance = secondRun.locator('[data-run-provenance]')
    await firstProvenance.waitFor({ timeout: 5_000 })
    await secondProvenance.waitFor({ timeout: 5_000 })

    const firstSeq = await firstProvenance.getAttribute('data-run-seq')
    const secondSeq = await secondProvenance.getAttribute('data-run-seq')
    expect(firstSeq).toBe('3')
    expect(secondSeq).toBe('10')
    expect(firstSeq).not.toBe(secondSeq)

    const firstProvenanceValue = await firstProvenance.getAttribute('data-run-provenance')
    const secondProvenanceValue = await secondProvenance.getAttribute('data-run-provenance')
    expect(firstProvenanceValue).not.toBeNull()
    expect(secondProvenanceValue).not.toBeNull()
    // The exact regression the user hit: two identical-outcome runs must NOT
    // carry the same provenance caption.
    expect(firstProvenanceValue).not.toBe(secondProvenanceValue)
    expect(firstProvenanceValue).toContain('seq 3')
    expect(secondProvenanceValue).toContain('seq 10')
    expect(firstProvenanceValue).toContain('local')
    expect(secondProvenanceValue).toContain('local')
  }, 60_000)

  it('names each run\'s execution and the task it ran', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-analysis-execution-id'))
    const nodes = page.locator('[data-chat-flow-kind="rheplicant-analysis"]')
    const firstProvenance = nodes.nth(0).locator('[data-run-name="fit"] [data-run-provenance]')
    const secondProvenance = nodes.nth(1).locator('[data-run-name="fit"] [data-run-provenance]')
    await firstProvenance.waitFor({ timeout: 5_000 })
    await secondProvenance.waitFor({ timeout: 5_000 })

    // The attribute carries the FULL id — the string a results tree on disk
    // is keyed by, and what a reader copies — and the two differ even though
    // their timestamp and taskDigest segments are identical.
    expect(await firstProvenance.getAttribute('data-execution-id')).toBe(FIRST_EXECUTION)
    expect(await secondProvenance.getAttribute('data-execution-id')).toBe(SECOND_EXECUTION)
    expect(FIRST_EXECUTION).not.toBe(SECOND_EXECUTION)

    // Both ran the same task file, and each card says so.
    expect(await firstProvenance.getAttribute('data-task-path')).toBe(TASK_PATH)
    expect(await secondProvenance.getAttribute('data-task-path')).toBe(TASK_PATH)

    // The caption text carries the SHORT id (it already states the time, so
    // repeating the timestamp segment would be noise) plus the task path.
    const firstCaption = await firstProvenance.getAttribute('data-run-provenance')
    const secondCaption = await secondProvenance.getAttribute('data-run-provenance')
    expect(firstCaption).toContain('3f9ac2b1-k7m2xq')
    expect(secondCaption).toContain('3f9ac2b1-b4d9tz')
    expect(firstCaption).not.toContain('20260822T134501Z')
    expect(firstCaption).toContain(TASK_PATH)
    expect(secondCaption).toContain(TASK_PATH)
  }, 60_000)

  it('issued zero model calls and stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
