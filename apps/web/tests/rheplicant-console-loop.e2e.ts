// Web e2e: the rheplicant console's workflow-loop surface — the LoopRail
// (five stage segments folding `rheplicant/validate` + `rheplicant/gates` +
// `rheplicant/run` into one loop projection, independent of chat) and the
// Gates panel (per-check cards from the gates report, post-flight findings
// from the run, and the two always-on informational checks). Scaffold
// pattern copied from `rheplicant-console-charts.e2e.ts`: seed a closed
// session carrying the three durable events, open the Console view, and
// assert the rail + panel render honestly off that one snapshot.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
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

// A closed single-turn recording carrying, in order:
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
  `{"type":"rheplicant/validate","seq":3,"time":1784974200828,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","report":{"valid":false,"errors":[{"path":"inference.parameters.g","code":"UNKNOWN_LATENT","message":"inference.parameters.g names a latent the model does not declare."}],"warnings":[]}}}`,
  `{"type":"rheplicant/gates","seq":4,"time":1784974200829,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","report":{"checks":[{"check":"linearity","mode":"refuse","id":"C12","state":"refuse","record":true,"reason":null,"where":"inference.checks.linearity","rtol":null},{"check":"identifiability","mode":"skip","id":"C13","state":"skip","record":false,"reason":${JSON.stringify(IDENTIFIABILITY_SKIP_REASON)},"where":"inference.checks.identifiability","rtol":0.01},{"check":"prior_sensitivity","mode":"skip","id":"C19","state":"off","record":false,"reason":null,"where":"inference.checks.prior_sensitivity","rtol":null}],"runs":[],"warnings":[]}}}`,
  `{"type":"rheplicant/run","seq":5,"time":1784974200830,"ignorable":true,"data":{"document":${JSON.stringify(DOCUMENT)},"transport":"local","outcome":{"runs":[{"name":"fit","kind":"nuts","status":"failed","diagnostics":{"rhat":1.4,"divergences":3,"converged":false},"error":{"code":"RUN_FAILED","message":"nuts sampler diverged."}}],"tookMs":842,"graph":{"graph":"single-antenna","lit":["sky"],"skipped":[],"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"20\\" height=\\"20\\" role=\\"img\\"></svg>"},"gates":[{"check":"C12","severity":"refuse","where":"inference.checks.linearity","message":"Linearity departure exceeds tolerance for operator NoiseWave."}]}}}`,
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
    scaffold = await launchWebScaffold({})
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

  it('renders five honest loop stages and the Gates panel', async () => {
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

    // The Console view is a conversation.view tab; select it.
    await page.getByRole('tab', { name: 'Console', exact: true }).click()

    const consoleView = page.locator('[data-rheplicant-console]')
    await consoleView.waitFor({ timeout: 15_000 })
    await consoleView.locator('[data-console-grid]').waitFor({ timeout: 5_000 })

    // --- LoopRail: five stages, each an honest verdict off the seeded events. ---
    const rail = page.locator('[data-loop-rail]')
    await rail.waitFor({ timeout: 10_000 })
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

    // Clicking a stage scrolls its panel into view and must never throw.
    await gatesStageEl.click()

    // --- Gates panel: one card per priced check, the run's post-flight
    // finding, and the two always-on informational checks. ---
    const gatesPanel = page.locator('[data-panel="gates"]')
    await gatesPanel.waitFor({ timeout: 10_000 })
    expect(await gatesPanel.locator('[data-panel-title]').innerText()).toBe('Gates')

    const checkCards = gatesPanel.locator('[data-gate-check]')
    await expect.poll(() => checkCards.count(), { timeout: 10_000 }).toBe(3)

    const linearityCard = gatesPanel.locator('[data-gate-check][data-check="linearity"]')
    await linearityCard.waitFor({ timeout: 5_000 })
    expect(await linearityCard.getAttribute('data-check-state')).toBe('refuse')
    // The card exposes its own parts: a state Badge and the mono `where` path
    // — the legibility fix's contract (title row / where / record / reason).
    const linearityBadge = linearityCard.locator('[data-badge-state]')
    await linearityBadge.waitFor({ timeout: 5_000 })
    expect(await linearityBadge.getAttribute('data-badge-state')).toBe('refuse')
    expect(await linearityCard.locator('[data-check-where] code').innerText()).toBe('inference.checks.linearity')

    const identifiabilityCard = gatesPanel.locator('[data-gate-check][data-check="identifiability"]')
    await identifiabilityCard.waitFor({ timeout: 5_000 })
    expect(await identifiabilityCard.getAttribute('data-check-state')).toBe('skip')
    expect(await identifiabilityCard.locator('[data-badge-state]').getAttribute('data-badge-state')).toBe('skip')
    expect(await identifiabilityCard.locator('[data-check-where] code').innerText()).toBe('inference.checks.identifiability')
    // The skip's reason renders VERBATIM in a blockquote.
    const reasonBlock = identifiabilityCard.locator('[data-gate-reason]')
    await reasonBlock.waitFor({ timeout: 5_000 })
    expect(await reasonBlock.innerText()).toBe(IDENTIFIABILITY_SKIP_REASON)

    const priorSensitivityCard = gatesPanel.locator('[data-gate-check][data-check="prior_sensitivity"]')
    await priorSensitivityCard.waitFor({ timeout: 5_000 })
    expect(await priorSensitivityCard.getAttribute('data-check-state')).toBe('off')
    // An `off` check carries no reason: no blockquote renders for it.
    expect(await priorSensitivityCard.locator('[data-gate-reason]').count()).toBe(0)

    // The run's post-flight finding (C12 refuse).
    const finding = gatesPanel.locator('[data-gate-finding]')
    await expect.poll(() => finding.count(), { timeout: 5_000 }).toBe(1)
    expect(await finding.getAttribute('data-check')).toBe('C12')
    expect(await finding.getAttribute('data-severity')).toBe('refuse')

    // The two always-on informational checks — never gated, rendered
    // regardless. Each is compressed to a one-line summary with the fuller
    // explanation behind a `[data-always-on-details]` disclosure (closed by
    // default — native `<details>` semantics keep its content in the DOM but
    // not painted, so assert presence/closed-state rather than visibility).
    const c16 = gatesPanel.locator('[data-always-on-check="C16"]')
    await c16.waitFor({ timeout: 5_000 })
    await c16.locator('[data-always-on-summary]').waitFor({ timeout: 5_000 })
    const c16Details = c16.locator('[data-always-on-details]')
    await c16Details.waitFor({ timeout: 5_000 })
    expect(await c16Details.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false)
    // `<details>` hides non-summary content from RENDERING while closed, not
    // from the DOM — `textContent` (not `innerText`, which returns '' for
    // unrendered content) reads it without opening the disclosure.
    expect(await c16Details.locator('[data-always-on-note]').textContent()).toContain('ADC saturation')

    const c18 = gatesPanel.locator('[data-always-on-check="C18"]')
    await c18.waitFor({ timeout: 5_000 })
    await c18.locator('[data-always-on-summary]').waitFor({ timeout: 5_000 })
    const c18Details = c18.locator('[data-always-on-details]')
    await c18Details.waitFor({ timeout: 5_000 })
    expect(await c18Details.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false)
    expect(await c18Details.locator('[data-always-on-note]').textContent()).toContain('two-sigma cross-check')
  }, 60_000)

  it('renders the Signal-path panel legend as four distinct, unconcatenated chips', async () => {
    // Regression coverage for the legend-spacing fix: the DOM used to have no
    // separation between chips at all — reading a chip's own text as one run
    // of concatenated text (`sourcetransformprocessingwire`). Each chip is
    // its own `[data-legend-node]` element, so its OWN textContent (swatch +
    // label) must equal exactly its kind name, never bleed into a neighbor's.
    const signalPath = page.locator('[data-panel="signal-path"]')
    await signalPath.waitFor({ timeout: 10_000 })
    const legend = signalPath.locator('[data-signal-path-legend]')
    await legend.waitFor({ timeout: 5_000 })
    const chips = legend.locator('[data-legend-node]')
    await expect.poll(() => chips.count(), { timeout: 5_000 }).toBe(4)

    const expectedLabelByKind: Record<string, string> = {
      source: 'source',
      transform: 'transform',
      processing: 'processing',
      wire: 'wire',
    }
    for (const [kind, label] of Object.entries(expectedLabelByKind)) {
      const chip = legend.locator(`[data-legend-node="${kind}"]`)
      await chip.waitFor({ timeout: 5_000 })
      // `textContent` (not `innerText`) is the direct DOM-level check: it
      // proves the chip's own text never bled together with a neighbor's —
      // exactly the bug the CSS-module flex/gap fix addresses.
      expect(await chip.textContent()).toBe(label)
      // Every chip carries its own color swatch — the visual half of the fix.
      expect(await chip.locator('[data-legend-swatch]').count()).toBe(1)
    }
  }, 30_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
