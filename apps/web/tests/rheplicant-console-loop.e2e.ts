// Web e2e: the rheplicant console tab — the LoopRail (five stage segments
// folding `rheplicant/validate` + `rheplicant/gates` + `rheplicant/run` into
// one loop projection, independent of chat) and the project header above it.
// Seed a closed session carrying the three durable events, open the Console
// view, and assert both render honestly off that one snapshot.
//
// **The Gates-panel assertions that used to live here are gone**, along with
// the console's panel grid (§20.4): the panels have exactly one seat now, the
// project surface's, and that surface reads the published TREE — so a seeded
// never-published gates report has no browser surface. They moved verbatim to
// `packages/rheplicant/ui-console/tests/GatesPanel.client.spec.tsx`, and the
// signal-path legend to `.../ui-analysis/tests/SignalPathPanel.client.spec.tsx`.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-console-loop-web-e2e'

// The verbatim skip reason, asserted byte-for-byte against the Gates panel's
// `[data-gate-reason]` blockquote — the wire contract for a skip/auto_skip
// state is that its reason renders unmodified, never paraphrased.
const IDENTIFIABILITY_SKIP_REASON =
  'Skipped pending a redesigned prior — rank test would reject every current draft.'

// One document reused across all three events (validate → gates → run on the
// SAME document, as the loop itself works): 4 top-level keys, so Author's
// "N sections" detail reads "4 sections".
const DOCUMENT = {
  model: { sky: { kind: 'point_source' } },
  inference: {
    checks: {
      linearity: { mode: 'refuse' },
      identifiability: { mode: 'skip', reason: IDENTIFIABILITY_SKIP_REASON },
      prior_sensitivity: { mode: 'off' },
    },
    parameters: { g: { kind: 'free' } },
  },
  runs: [{ name: 'fit', kind: 'nuts' }],
  runtime: { seed: 1 },
}

// A closed single-turn recording carrying, in order — all three naming the
// SAME `taskPath`, because a loop belongs to a task (`docs/project-model.md`
// §19) and `taskPath` has been on every durable event since P1. This fixture
// used to omit it from validate and gates, which split one conversation's work
// across two rails; the events a real run emits carry it on all three.
//   - `rheplicant/validate` — invalid (one error: `inference.parameters.g`,
//     code `UNKNOWN_LATENT`) — the four-pass rail's pre-flight evidence.
//   - `rheplicant/gates` — three priced checks: linearity `refuse` (id C12),
//     identifiability `skip` (id C13) WITH the verbatim reason above,
//     prior_sensitivity `off` (id C19, reason null) — each carrying
//     state/where/record/rtol.
//   - `rheplicant/run` — one FAILED run (`RUN_FAILED`, not `BUILD_FAILED`,
//     so axes/built are genuinely ambiguous — the "unknown" pass chip),
//     diagnostics `rhat: 1.4` / `divergences: 3` / `converged: false`, a
//     signal-path `graph` (the document declares `model: { sky: ... }`, so
//     the console's `signal-path` panel has data to render its legend from),
//     and one post-flight gate finding (C12 refuse) — the always-on C16/C18
//     rows are never sourced from an event; the panel renders them
//     unconditionally once there is any gates evidence at all.
// All three events are `ignorable` (the envelope marker for the out-of-repo
// event type — see `packages/core/session/src/index.ts`'s `append` patch).
const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974200747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974200758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974200759,"data":{"content":[{"type":"text","text":"Open the console view."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974200827,"data":{"turn":1,"step":1}}',
  `{"type":"rheplicant/validate","seq":3,"time":1784974200828,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","taskPath":"tasks/global-signal-fit.yaml","report":{"valid":false,"errors":[{"path":"inference.parameters.g","code":"UNKNOWN_LATENT","message":"inference.parameters.g names a latent the model does not declare."}],"warnings":[]}}}`,
  `{"type":"rheplicant/gates","seq":4,"time":1784974200829,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","taskPath":"tasks/global-signal-fit.yaml","report":{"checks":[{"check":"linearity","mode":"refuse","id":"C12","state":"refuse","record":true,"reason":null,"where":"inference.checks.linearity","rtol":null},{"check":"identifiability","mode":"skip","id":"C13","state":"skip","record":false,"reason":${JSON.stringify(IDENTIFIABILITY_SKIP_REASON)},"where":"inference.checks.identifiability","rtol":0.01},{"check":"prior_sensitivity","mode":"skip","id":"C19","state":"off","record":false,"reason":null,"where":"inference.checks.prior_sensitivity","rtol":null}],"runs":[],"warnings":[]}}}`,
  `{"type":"rheplicant/run","seq":5,"time":1784974200830,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","executionId":"20260822T134501Z-3f9ac2b1-k7m2xq","taskDigest":"3f9ac2b1","taskPath":"tasks/global-signal-fit.yaml","outcome":{"resultsPath":"/home/z/rhino-2026/results/tasks/global-signal-fit/20260822T134501Z-3f9ac2b1-k7m2xq","runs":[{"name":"fit","kind":"nuts","status":"failed","diagnostics":{"rhat":1.4,"divergences":3,"converged":false},"error":{"code":"RUN_FAILED","message":"nuts sampler diverged."}}],"tookMs":842,"graph":{"graph":"single-antenna","lit":["sky"],"skipped":[],"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"20\\" height=\\"20\\" role=\\"img\\"></svg>"},"gates":[{"check":"C12","severity":"refuse","where":"inference.checks.linearity","message":"Linearity departure exceeds tolerance for operator NoiseWave."}]}}}`,
  '{"type":"assistant/message","seq":6,"time":1784974200831,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The console view is ready."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":7,"time":1784974200832,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":8,"time":1784974200833,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: rheplicant console workflow loop (LoopRail + Gates panel)', () => {
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

  it('renders five honest loop stages off one task\'s events', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-console-loop'))

    // Open the seeded session: expand the workspace group, then click the session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()

    // Confirm the seeded session opened (its user prompt renders).
    await page.getByText('Open the console view.', { exact: true }).waitFor({ timeout: 10_000 })

    // §23: a session-header disclosure, not a view tab. It opens beside the
    // session title, so reading what this conversation did no longer costs
    // leaving the conversation.
    await page.locator('[data-session-activity-trigger]').click()
    const activityPanel = page.locator('[data-session-activity-popover]')
    await activityPanel.waitFor({ timeout: 15_000 })

    // --- LoopRail: ONE rail, because all three events name one task (§19). ---
    const rail = page.locator('[data-loop-rail]')
    await rail.waitFor({ timeout: 10_000 })
    expect(await page.locator('[data-loop-rail]').count()).toBe(1)
    // The label is load-bearing: two unlabelled rails read as one loop again.
    expect(await rail.getAttribute('aria-label'))
      .toBe('Workflow loop for tasks/global-signal-fit.yaml')
    const stages = rail.locator('[data-loop-stage]')
    await expect.poll(() => stages.count(), { timeout: 10_000 }).toBe(5)

    const expectedStageStates: Record<string, string> = {
      author: 'ok',
      validate: 'error',
      gates: 'error',
      run: 'error',
      diagnostics: 'error',
    }
    for (const [stageId, expectedState] of Object.entries(expectedStageStates)) {
      const stage = rail.locator(`[data-loop-stage="${stageId}"]`)
      await stage.waitFor({ timeout: 5_000 })
      expect(await stage.getAttribute('data-stage-state'), `stage ${stageId}`).toBe(expectedState)
    }

    // Author's section count is honest: the seeded document has 4 top-level keys.
    expect(await rail.locator('[data-loop-stage="author"]').innerText()).toContain('4 section')

    // The validate stage's detail names the first error's path + code, verbatim.
    const validateStage = rail.locator('[data-loop-stage="validate"]')
    expect(await validateStage.innerText()).toContain('inference.parameters.g')
    expect(await validateStage.innerText()).toContain('UNKNOWN_LATENT')

    // The four-pass breakdown: pre-flight and post-flight have real evidence
    // (both `error`, matching the invalid validate report and the run's
    // refuse-severity post-flight finding); axes/built are genuinely
    // ambiguous for a run that failed with a non-`BUILD_FAILED` code, so at
    // least one of them renders `unknown` rather than an invented verdict.
    const passes = validateStage.locator('[data-pass]')
    await expect.poll(() => passes.count(), { timeout: 5_000 }).toBe(4)
    const passIds = ['pre-flight', 'axes', 'built', 'post-flight']
    const passStates: string[] = []
    for (const passId of passIds) {
      const pass = validateStage.locator(`[data-pass="${passId}"]`)
      await pass.waitFor({ timeout: 5_000 })
      const state = await pass.getAttribute('data-pass-state')
      expect(state, `pass ${passId}`).not.toBeNull()
      passStates.push(state ?? '')
    }
    expect(passStates).toContain('unknown')
    expect(await validateStage.locator('[data-pass="pre-flight"]').getAttribute('data-pass-state')).toBe('error')
    expect(await validateStage.locator('[data-pass="post-flight"]').getAttribute('data-pass-state')).toBe('error')

    // The Gates stage carries the stale marker: identifiability is skip-like.
    const gatesStageEl = rail.locator('[data-loop-stage="gates"]')
    await gatesStageEl.locator('[data-loop-stage-stale]').waitFor({ timeout: 5_000 })

    // Clicking a stage must never throw, even with no panel left to scroll to.
    await gatesStageEl.click()
  }, 60_000)

  it('carries no panel grid — the panels belong to the project surface now (§20.4)', async () => {
    // The Gates and Signal-path assertions that used to sit here went to jsdom
    // specs beside their components (`GatesPanel.client.spec.tsx` in this
    // package, `SignalPathPanel.client.spec.tsx` in ui-analysis): both panels
    // now have exactly one seat, the workbench's, and that surface reads the
    // published TREE, so a seeded never-published report has no browser
    // surface. What stays here is the guard that the second seat did not
    // quietly come back.
    expect(await page.locator('[data-console-grid]').count()).toBe(0)
    expect(await page.locator('[data-panel="gates"]').count()).toBe(0)
    expect(await page.locator('[data-panel="signal-path"]').count()).toBe(0)
  })

  it('heads the console with the project, task and execution being shown', async () => {
    // docs/project-model.md §6.1, in a real browser: the header derives every
    // field from the run event's own published path, so a slot crash here (the
    // failure mode a `conversation.view` entry has) would show as height 0
    // rather than a wrong string.
    const header = page.locator('[data-project-header]')
    await header.waitFor({ timeout: 10_000 })
    const text = await header.textContent()
    expect(text).toContain('rhino-2026')
    expect(text).toContain('tasks/global-signal-fit')

    expect(await page.locator('[data-execution-freshness]').getAttribute('data-execution-freshness'))
      .toBe('current')
    expect(await page.locator('[data-execution-path]').textContent())
      .toBe('results/tasks/global-signal-fit/20260822T134501Z-3f9ac2b1-k7m2xq/')

    // This session's one run FAILED, and the header says so rather than
    // letting the execution read as ok because it completed.
    await page.locator('[data-execution-status="failed"]').waitFor({ timeout: 5_000 })

    // One execution means nothing to pick between; the picker stays away.
    expect(await page.locator('[data-execution-picker]').count()).toBe(0)

    // The scope of the list is stated on screen, because it is a session's
    // list and not the project's (§8.1).
    expect(await page.locator('[data-header-rule]').textContent())
      .toContain('not every execution in the project')
  }, 30_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
