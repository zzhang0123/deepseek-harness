// Web e2e: the console tab's loop rail folds a run's PER-LATENT `mcmc`
// diagnostics into its Diagnostics stage, at the same r_hat threshold the
// scalar check uses, and names the offending latent.
//
// **This file used to assert the chart panels too**, driven off the same
// seeded run through the console's `console.panel` grid. §20.4 removed that
// grid: the panels live in the project surface alone now, and that surface
// reads the published TREE rather than a session log — so a seeded,
// never-published run has no browser surface to draw on. Those assertions
// moved, verbatim in their values, to jsdom specs beside the components they
// were really about:
//
// * `packages/rheplicant/ui-posterior/tests/chart-kit.client.spec.tsx` — the
//   full chain grammar (scalar series, fanned pair, credible band), the
//   provenance caption, the per-latent StatRow pairs and their verdict dots,
//   and the corner-plot disclosure.
// * `.../ui-identifiability/tests/IdentifiabilityPanel.client.spec.tsx` — the
//   singular-value bars, the rank cutoff, and `weakest_identified`.
// * `.../ui-spectrum/tests/SpectrumPanel.client.spec.tsx` — the heatmap cells
//   and the non-finite one.
//
// One assertion did not survive and is recorded in the first of those files:
// the chart-kit tooltip on hover needs real layout, which jsdom has none of.
//
// What stays here is what is still SESSION-shaped: the rail. The `fit` run's
// scalar r_hat (1.004) is fine on its own, so the Diagnostics stage is not
// `ok` only because `centre`'s per-latent r_hat (1.42) is over threshold —
// which is the whole point of folding `mcmc` into that check.
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
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.004,"n_eff":980,"divergences":0,"notes":[],"mcmc":{"depth":{"r_hat":0.9906,"n_eff":82.6},"centre":{"r_hat":1.42,"n_eff":91.3}}},"chains":{"g":[1,1.1,1.2,1.05,1.08,1.15],"amp":[0.5,0.51,0.49,0.52,0.5,0.5],"beam[0]":[2,2.1,1.9,2.05,2,1.95],"beam[1]":[0.3,0.32,0.29,0.31,0.3,0.28],"wide.mean":[10,10.4,10.78,11.13,11.43,11.68,11.86,11.97,12,11.95,11.82,11.62,11.35,11.03,10.67,10.28,9.88,9.49,9.11,8.78,8.49,8.26,8.1,8.01,8.01,8.08,8.23,8.45,8.74,9.07,9.44,9.83,10.23,10.62,10.99,11.31,11.59,11.8,11.94,12],"wide.q05":[9,9.4,9.78,10.13,10.43,10.68,10.86,10.97,11,10.95,10.82,10.62,10.35,10.03,9.67,9.28,8.88,8.49,8.11,7.78,7.49,7.26,7.1,7.01,7.01,7.08,7.23,7.45,7.74,8.07,8.44,8.83,9.23,9.62,9.99,10.31,10.59,10.8,10.94,11],"wide.q95":[11,11.4,11.78,12.13,12.43,12.68,12.86,12.97,13,12.95,12.82,12.62,12.35,12.03,11.67,11.28,10.88,10.49,10.11,9.78,9.49,9.26,9.1,9.01,9.01,9.08,9.23,9.45,9.74,10.07,10.44,10.83,11.23,11.62,11.99,12.31,12.59,12.8,12.94,13]}},{"name":"ident","kind":"identifiability","status":"ok","diagnostics":{"rank":3,"nullity":2,"singular_values":[120,80,30,4,0.5],"weakest_identified":0.25,"notes":[]}},{"name":"mmode","kind":"mmodes","status":"ok","spectrum":[[0.1,0.2,0.3,0.4],[0.5,null,0.7,0.8],[0.9,1,1.1,1.2],[1.3,1.4,1.5,1.6]]}],"tookMs":57},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974100829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The console view is ready."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974100830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974100831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: the console tab reads per-latent mcmc diagnostics', () => {
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

  it('warns the Diagnostics stage on a per-latent r_hat, naming the latent', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-console-charts'))

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

    const rail = page.locator('[data-loop-rail]')
    await rail.waitFor({ timeout: 10_000 })
    const diagnosticsStage = rail.locator('[data-loop-stage="diagnostics"]')
    await diagnosticsStage.waitFor({ timeout: 5_000 })
    expect(await diagnosticsStage.getAttribute('data-stage-state')).toBe('warn')
    const detail = await diagnosticsStage.innerText()
    expect(detail).toContain('centre')
    expect(detail).toContain('1.42')
  }, 60_000)

  it('carries no panel grid — the panels belong to the project surface now (§20.4)', async () => {
    expect(await page.locator('[data-console-grid]').count()).toBe(0)
    expect(await page.locator('[data-panels-menu]').count()).toBe(0)
    expect(await page.locator('[data-panel="posterior"]').count()).toBe(0)
  })

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
