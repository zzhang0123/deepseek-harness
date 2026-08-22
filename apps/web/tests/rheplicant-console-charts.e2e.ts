// Web e2e: the rheplicant console panels rebuilt on the shared chart kit
// (ChartSurface/Axis/Tooltip/TracePlot/Histogram/BarChart/HeatMap/BandChart)
// render real chart-kit DOM from one seeded `rheplicant/run` event — a nuts
// run whose `chains` exercise the full wire grammar (two scalar series, one
// fanned component pair, one credible-band triplet), an identifiability run,
// and an mmodes run with a null cell. The console tab only renders once a
// session is open, so the scenario seeds and opens one first.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-console-charts-web-e2e'

// A closed single-turn recording carrying one durable `rheplicant/run` event
// with three runs:
//   - `fit` (nuts): `chains` exercising the full wire grammar — two scalar
//     series (`g`, `amp`), one fanned component pair (`beam[0]`, `beam[1]`),
//     and one credible-band triplet (`wide.mean`/`wide.q05`/`wide.q95`, 40
//     points) — plus rhat/n_eff/divergences diagnostics.
//   - `ident` (identifiability): singular_values [120, 80, 30, 4, 0.5],
//     rank 3, nullity 2, and weakest_identified 0.25 — the ratio
//     `singular_values[rank-1] / singular_values[0]` = 30/120, matching
//     `IdentifiabilityReport.weakest_identified` (inference/identifiability.py).
//   - `mmode` (mmodes): a 4x4 spectrum with one null (non-finite) cell.
// The event is marked `ignorable` (the envelope marker for the out-of-repo
// event type).
const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974100747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974100758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974100759,"data":{"content":[{"type":"text","text":"Open the console view."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974100827,"data":{"turn":1,"step":1}}',
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.004,"n_eff":980,"divergences":2,"notes":[]},"chains":{"g":[1,1.1,1.2,1.05,1.08,1.15],"amp":[0.5,0.51,0.49,0.52,0.5,0.5],"beam[0]":[2,2.1,1.9,2.05,2,1.95],"beam[1]":[0.3,0.32,0.29,0.31,0.3,0.28],"wide.mean":[10,10.4,10.78,11.13,11.43,11.68,11.86,11.97,12,11.95,11.82,11.62,11.35,11.03,10.67,10.28,9.88,9.49,9.11,8.78,8.49,8.26,8.1,8.01,8.01,8.08,8.23,8.45,8.74,9.07,9.44,9.83,10.23,10.62,10.99,11.31,11.59,11.8,11.94,12],"wide.q05":[9,9.4,9.78,10.13,10.43,10.68,10.86,10.97,11,10.95,10.82,10.62,10.35,10.03,9.67,9.28,8.88,8.49,8.11,7.78,7.49,7.26,7.1,7.01,7.01,7.08,7.23,7.45,7.74,8.07,8.44,8.83,9.23,9.62,9.99,10.31,10.59,10.8,10.94,11],"wide.q95":[11,11.4,11.78,12.13,12.43,12.68,12.86,12.97,13,12.95,12.82,12.62,12.35,12.03,11.67,11.28,10.88,10.49,10.11,9.78,9.49,9.26,9.1,9.01,9.01,9.08,9.23,9.45,9.74,10.07,10.44,10.83,11.23,11.62,11.99,12.31,12.59,12.8,12.94,13]}},{"name":"ident","kind":"identifiability","status":"ok","diagnostics":{"rank":3,"nullity":2,"singular_values":[120,80,30,4,0.5],"weakest_identified":0.25,"notes":[]}},{"name":"mmode","kind":"mmodes","status":"ok","spectrum":[[0.1,0.2,0.3,0.4],[0.5,null,0.7,0.8],[0.9,1,1.1,1.2],[1.3,1.4,1.5,1.6]]}],"tookMs":57},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974100829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The console view is ready."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974100830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974100831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: rheplicant console panels render the chart kit', () => {
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

  it('renders Chains/Posterior/Identifiability/Spectrum on the chart kit', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-console-charts'))

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

    // --- Chains panel (new): registered after Posterior in the same plugin. ---
    const chains = page.locator('[data-panel="chains"]')
    await chains.waitFor({ timeout: 10_000 })
    expect(await chains.locator('[data-panel-title]').innerText()).toBe('Chains')

    const chainsRun = chains.locator('[data-chains-run][data-run-name="fit"]')
    await chainsRun.waitFor({ timeout: 10_000 })

    // The fanned component pair (`beam[0]`/`beam[1]`) groups as one 'series'
    // chain group with two series — a multi-series TracePlot with a legend.
    const beamGroup = chainsRun.locator('[data-chain-group="beam"]')
    await beamGroup.waitFor({ timeout: 5_000 })
    const beamTrace = beamGroup.locator('[data-chart-kind="trace"]')
    await beamTrace.waitFor({ timeout: 5_000 })
    expect(await beamTrace.locator('[data-series]').count()).toBeGreaterThanOrEqual(2)
    expect(await beamTrace.locator('[data-tick]').count()).toBeGreaterThan(0)
    // The legend renders as a sibling of the chart surface (TracePlot's own
    // wrapping div), not a descendant of `[data-chart-kind="trace"]`.
    expect(await beamGroup.locator('[data-legend-item]').count()).toBeGreaterThanOrEqual(1)

    // Hovering the trace svg surfaces the shared chart-kit tooltip.
    await beamTrace.hover()
    await beamTrace.locator('[data-chart-tip]').waitFor({ timeout: 5_000 })

    // The credible-band triplet (`wide.mean`/`wide.q05`/`wide.q95`) groups as
    // one 'band' chain group, rendered by BandChart.
    const wideGroup = chainsRun.locator('[data-chain-group="wide"]')
    await wideGroup.waitFor({ timeout: 5_000 })
    const wideBand = wideGroup.locator('[data-chart-kind="band"]')
    await wideBand.waitFor({ timeout: 5_000 })
    expect(await wideBand.locator('[data-band]').count()).toBeGreaterThan(0)
    expect(await wideBand.locator('[data-mean-line]').count()).toBeGreaterThan(0)

    // Per-run diagnostics (rhat/n_eff/divergences) fold into StatRow chips.
    expect(await chainsRun.locator('[data-stat="rhat"] [data-stat-value]').innerText()).toContain('1.004')
    expect(await chainsRun.locator('[data-stat="n_eff"] [data-stat-value]').innerText()).toContain('980')
    expect(await chainsRun.locator('[data-stat="divergences"] [data-stat-value]').innerText()).toContain('2')

    // --- Posterior panel: marginals by default, corner behind a disclosure. ---
    const posterior = page.locator('[data-panel="posterior"]')
    await posterior.waitFor({ timeout: 10_000 })
    const posteriorRun = posterior.locator('[data-posterior-run][data-run-name="fit"]')
    await posteriorRun.waitFor({ timeout: 10_000 })

    const marginal = posteriorRun.locator('[data-marginal]').first()
    await marginal.waitFor({ timeout: 5_000 })
    expect(await posteriorRun.locator('[data-marginal]').count()).toBeGreaterThanOrEqual(1)
    expect(await marginal.locator('[data-bin]').count()).toBeGreaterThan(0)

    // The corner plot is collapsed behind a disclosure by default: the
    // `<details>` is closed and its content is present in the DOM but not
    // rendered (native `<details>` semantics — `count()` still finds it, so
    // assert on visibility, not presence).
    // ADAPTED: PosteriorPanel now renders ui-kit's `CornerGrid` (commit
    // e7cf415) instead of the old hand-rolled scatter/histogram corner plot —
    // `[data-corner]` no longer exists; the real DOM is one
    // `<svg data-corner-grid>` with one `[data-corner-cell="row,col"]` per
    // lower-triangle 2D density pane and one `[data-corner-diagonal="index"]`
    // per 1D marginal on the diagonal.
    const cornerDetails = posteriorRun.locator('[data-corner-details]')
    await cornerDetails.waitFor({ timeout: 5_000 })
    expect(await cornerDetails.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false)
    expect(await cornerDetails.locator('[data-corner-grid]').isVisible()).toBe(false)
    await cornerDetails.locator('summary').click()
    const cornerGrid = cornerDetails.locator('[data-corner-grid]')
    await cornerGrid.waitFor({ timeout: 5_000 })
    expect(await cornerDetails.evaluate(el => (el as HTMLDetailsElement).open)).toBe(true)
    expect(await cornerGrid.locator('[data-corner-cell]').count()).toBeGreaterThan(0)
    expect(await cornerGrid.locator('[data-corner-diagonal]').count()).toBeGreaterThan(0)

    // --- Identifiability panel: BarChart over the singular-value spectrum. ---
    const identifiability = page.locator('[data-panel="identifiability"]')
    await identifiability.waitFor({ timeout: 10_000 })
    const identRun = identifiability.locator('[data-identifiability-run][data-run-name="ident"]')
    await identRun.waitFor({ timeout: 10_000 })
    const identChart = identRun.locator('[data-singular-values]')
    await identChart.waitFor({ timeout: 5_000 })
    expect(await identChart.locator('[data-bar]').count()).toBe(5)
    // A vertical SVG `<line>` has a zero-width bounding box, so Playwright's
    // visibility heuristic reports it "hidden" even though it renders — wait
    // for DOM presence rather than the (default) visible state.
    await identChart.locator('[data-cutoff]').waitFor({ state: 'attached', timeout: 5_000 })
    expect(await identChart.locator('[data-cutoff]').count()).toBe(1)
    expect(await identRun.locator('[data-stat="rank"] [data-stat-value]').innerText()).toContain('3')
    expect(await identRun.locator('[data-stat="nullity"] [data-stat-value]').innerText()).toContain('2')
    expect(await identRun.locator('[data-stat="weakest_identified"] [data-stat-value]').innerText()).toContain('0.25')

    // --- Spectrum panel: HeatMap over the m-mode power spectrum. ---
    const spectrum = page.locator('[data-panel="spectrum"]')
    await spectrum.waitFor({ timeout: 10_000 })
    const spectrumRun = spectrum.locator('[data-spectrum-run][data-run-name="mmode"]')
    await spectrumRun.waitFor({ timeout: 10_000 })
    await spectrumRun.locator('[data-cell]').first().waitFor({ timeout: 5_000 })
    expect(await spectrumRun.locator('[data-cell]').count()).toBe(16)
    expect(await spectrumRun.locator('[data-cell-null]').count()).toBe(1)
    expect(await spectrumRun.locator('[data-ramp]').count()).toBe(1)
  }, 60_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
