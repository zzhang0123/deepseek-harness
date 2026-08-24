// Web e2e scenario: the durable rheplicant analysis-run node renders from a
// seeded `rheplicant/run` event — keyless, zero model calls. The seed is a
// cold session log (no replay fixture), so a stray model stream fails loud on
// the open llm seam; the node itself folds from the log through the real
// client assembler and the real built ui-analysis bundle.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-analysis-web-e2e'

// A closed single-turn recording carrying one durable `rheplicant/run` event
// (document + outcome + transport), folded by the `rheplicant-analysis`
// Definition into a keyed Chat node. The event is marked `ignorable` — the
// envelope marker for a purely-informational downstream (out-of-repo) event
// type, which the persistence read path otherwise refuses as unknown.
const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974100747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974100758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974100759,"data":{"content":[{"type":"text","text":"Run the forward analysis and read back the result."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974100827,"data":{"turn":1,"step":1}}',
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{"schema_version":1,"model":{"global_signal":{"depth":0.1,"centre":75e6,"width":5e6},"gain":{"gain":1.1},"noise":{"sigma":0.05}}},"outcome":{"runs":[{"name":"sim","kind":"forward","status":"ok","diagnostics":{"converged":true,"rhat":1.02,"rank":6,"nullity":0,"chi2":12.4,"n_eff":1200,"divergences":0,"kappa":40.0,"notes":["seed=42","n_draw=1000"]}},{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.002,"n_eff":1327,"divergences":0,"notes":[]},"chains":{"g":[1.0,1.1,1.2,1.05,1.08,1.15],"amp":[0.5,0.51,0.49,0.52,0.5,0.5]}},{"name":"post","kind":"predict","status":"failed"}],"tookMs":42,"graph":{"graph":"single-antenna","lit":["global_signal","gain","noise"],"skipped":["astro_sum","beam_spill"],"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"20\\" height=\\"20\\" role=\\"img\\"></svg>"},"gates":[{"check":"C12","severity":"warn","where":"inference.parameters.g","message":"relative departure exceeds rtol","departure":[["g",[[0.001,1.32e-4],[1,4.89e-1],[1000,null]]]]}]},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974100829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The forward run completed."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974100830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974100831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: rheplicant analysis node renders from the log', () => {
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

  it('folds the seeded rheplicant/run event into one rendered rheplicant-analysis node', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-analysis'))
    // Expand the workspace group, then open the seeded session.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()

    // Confirm the seeded session opened (the user prompt renders).
    await page.getByText('Run the forward analysis and read back the result.', { exact: true })
      .waitFor({ timeout: 10_000 })

    // The node seat renders keyed by its business kind (the real client
    // assembler folded the durable event into this Chat node).
    const node = page.locator('[data-chat-flow-kind="rheplicant-analysis"]')
    await node.waitFor({ timeout: 15_000 })
    expect(await node.count()).toBe(1)

    // The keyed renderer (AnalysisRunPanel) renders one row per run with its
    // status, and the wall-clock footer.
    const panel = node.locator('[data-rheplicant-analysis]')
    await panel.waitFor({ timeout: 5_000 })
    const sim = panel.locator('[data-run-name="sim"]')
    await sim.waitFor({ timeout: 5_000 })
    expect(await sim.getAttribute('data-run-status')).toBe('ok')
    expect(await sim.innerText()).toContain('forward')
    const post = panel.locator('[data-run-name="post"]')
    expect(await post.getAttribute('data-run-status')).toBe('failed')
    expect(await post.innerText()).toContain('predict')
    expect(await panel.locator('[data-took-ms]').innerText()).toContain('42')

    // The per-run diagnostics panel renders the authoritative numbers (r_hat,
    // identifiability rank, joint χ²) separately from the model's prose, and a
    // failed run with no diagnostics renders no panel.
    const simDiag = sim.locator('[data-run-diagnostics]')
    await simDiag.waitFor({ timeout: 5_000 })
    expect(await simDiag.locator('[data-diag-converged]').innerText()).toBe('yes')
    expect(await simDiag.locator('[data-diag-rhat]').innerText()).toContain('1.02')
    expect(await simDiag.locator('[data-diag-rank]').innerText()).toContain('6')
    expect(await simDiag.locator('[data-diag-nullity]').innerText()).toContain('0')
    expect(await simDiag.locator('[data-diag-chi2]').innerText()).toContain('12.4')
    expect(await simDiag.locator('[data-diag-notes]').innerText()).toContain('seed=42')
    // formatDiagnostic renders n_eff as a thousands-separated integer.
    expect(await simDiag.locator('[data-diag-n-eff]').innerText()).toContain('1,200')
    expect(await simDiag.locator('[data-diag-divergences]').innerText()).toContain('0')
    expect(await simDiag.locator('[data-diag-kappa]').innerText()).toContain('40')
    expect(await post.locator('[data-run-diagnostics]').count()).toBe(0)

    // The lit/dim signal-path graph renders the model's declared operators,
    // separately from prose.
    const sig = panel.locator('[data-signal-path]')
    await sig.waitFor({ timeout: 5_000 })
    expect(await sig.locator('[data-signal-path-svg]').count()).toBe(1)
    expect(await sig.locator('[data-signal-path-lit]').innerText()).toContain('global_signal')
    expect(await sig.locator('[data-signal-path-lit]').innerText()).toContain('gain')
    expect(await sig.locator('[data-signal-path-lit]').innerText()).toContain('noise')

    // Post-flight gate verdicts render one row per finding.
    const gatesEl = panel.locator('[data-gates]')
    await gatesEl.waitFor({ timeout: 5_000 })
    expect(await gatesEl.locator('[data-gate]').first().getAttribute('data-gate-check')).toBe('C12')
    expect(await gatesEl.locator('[data-gate]').first().innerText()).toContain('departure')

    // C12's departure is the one gate field that is a NUMBER rather than a
    // sentence, and the three probe scales stay apart because the trend across
    // them is the diagnosis: "affine until the probe is large" and "not affine
    // anywhere" are different faults, and a summary renders them identically.
    // The seed's last probe is `null` — the wire's spelling of a non-finite
    // measurement, which upstream counts as a FAILURE — so the assertion that
    // it draws `—` and not `0` is the one that keeps a verdict from inverting
    // on its way to the screen.
    const departure = gatesEl.locator('[data-departure-latent="g"]')
    await departure.waitFor({ timeout: 5_000 })
    const probes = departure.locator('[data-departure-probe]')
    expect(await probes.count()).toBe(3)
    expect(await probes.nth(0).getAttribute('data-departure-scale')).toBe('0.001')
    expect(await probes.nth(0).innerText()).toBe('0.001× → 1.32e-4')
    expect(await probes.nth(2).getAttribute('data-departure-scale')).toBe('1000')
    // The WHOLE string, because the interesting half is what is NOT there: a
    // `.not.toContain('0')` reads as "no zero rendered" and is satisfied by the
    // scale's own digits, so it passes on `1000× → 0` too — the exact case it
    // was written to catch.
    expect(await probes.nth(2).innerText()).toBe('1000× → —')

    const fit = panel.locator('[data-run-name="fit"]')
    await fit.waitFor({ timeout: 5_000 })
    expect(await fit.getAttribute('data-run-status')).toBe('ok')

    // The surrounding turn's closing assistant message renders too.
    expect(await page.getByText('The forward run completed.', { exact: true }).count()).toBe(1)
  }, 60_000)

  it('draws the sampler run\'s chains here, because this run published nothing', async () => {
    // `docs/project-model.md` §20.6. This seed's outcome names no
    // `resultsPath`, so `receipt()` left its arrays on the event and there is
    // no results folder for the project surface to read — this node is the
    // only copy there is. A published run's node carries no arrays at all,
    // which is what keeps the two surfaces from ever showing the same run.
    const draws = page.locator('[data-scratch-draws="fit"]')
    await draws.waitFor({ timeout: 10_000 })
    // Closed by default: this is a transcript, and a chart that opened itself
    // would push the conversation off the screen.
    expect(await draws.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false)
    await draws.locator('summary').click()
    await draws.locator('[data-chain-group="g"]').waitFor({ timeout: 5_000 })
    expect(await draws.locator('[data-chain-group="amp"] [data-chart-kind="trace"]').count()).toBe(1)
    expect((await draws.innerText()).toLowerCase()).toContain('published nothing')
  })

  it('offers no way into the project view, which has no folder to open', async () => {
    // The other half of the same fact. Sending someone to the project surface
    // for an unpublished execution would land them on "the results are in this
    // execution's folder, which this console could not read" — of a run that
    // has no folder at all.
    expect(await page.locator('[data-open-in-project]').count()).toBe(0)
  })

  it('draws nothing for a run that produced no arrays', async () => {
    // `sim` is a forward run: it published nothing either, and it has nothing
    // to draw. Absent is the honest render, not an empty chart frame.
    expect(await page.locator('[data-scratch-draws="sim"]').count()).toBe(0)
  })

  it('issued zero model calls and stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
