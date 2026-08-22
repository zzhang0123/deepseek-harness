// Web e2e: the rheplicant console view (a conversation.view tab) renders its
// `console.panel` grid, and the posterior plugin injects its panel into that
// slot. The console tab only renders once a session is open, so the scenario
// seeds and opens one first.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
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

describe('web e2e: rheplicant console view renders its panel grid', () => {
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

  it('renders the Console view grid and the posterior panel', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-ui-console'))

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

    // The console grid renders, and the posterior panel occupies its slot.
    // The panel-chrome DOM (Panel/StatRow/Badge/EmptyState from ui-kit) is
    // shared by every console.panel occupant: `[data-panel="<id>"]` is the
    // shell, `[data-panel-title]` its heading text.
    const consoleView = page.locator('[data-rheplicant-console]')
    await consoleView.waitFor({ timeout: 15_000 })
    expect(await consoleView.count()).toBe(1)
    await consoleView.locator('[data-console-grid]').waitFor({ timeout: 5_000 })

    const posterior = page.locator('[data-panel="posterior"]')
    await posterior.waitFor({ timeout: 10_000 })
    expect(await posterior.count()).toBe(1)
    expect(await posterior.locator('[data-panel-title]').innerText()).toBe('Posterior')

    // The Panel shell's CSS Module background (`var(--dsw-alias-bg-layer-1)`)
    // must actually be injected — a computed, non-transparent color proves the
    // bundled panel.module.css reached the page, not just the DOM markup.
    const posteriorBg = await posterior.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(posteriorBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(posteriorBg).not.toBe('transparent')
    expect(posteriorBg).toMatch(/^rgba?\(/)

    // The posterior folds the seeded rheplicant/run into per-latent marginal
    // histograms (the chart kit's Histogram), and the spectrum/identifiability
    // panels render their own runs from the same log.
    const run = posterior.locator('[data-posterior-run]')
    await run.waitFor({ timeout: 10_000 })
    expect(await run.count()).toBe(1)
    expect(await run.getAttribute('data-run-name')).toBe('fit')
    const marginal = run.locator('[data-marginal]').first()
    await marginal.waitFor({ timeout: 5_000 })
    expect(await run.locator('[data-marginal]').count()).toBeGreaterThan(0)
    expect(await marginal.locator('[data-bin]').count()).toBeGreaterThan(0)

    // The pairwise corner plot moved behind a collapsed disclosure; open it
    // before asserting its contents (native `<details>` semantics hide
    // non-summary content from view, not from the DOM, while collapsed).
    // ADAPTED: PosteriorPanel now renders ui-kit's `CornerGrid` (commit
    // e7cf415) instead of the old hand-rolled scatter/histogram corner plot —
    // `[data-corner]`/`[data-corner-hist]`/`[data-corner-scatter]` no longer
    // exist; the real DOM is one `<svg data-corner-grid>` with one
    // `[data-corner-cell="row,col"]` per lower-triangle 2D density pane and
    // one `[data-corner-diagonal="index"]` per 1D marginal on the diagonal.
    const cornerDetails = run.locator('[data-corner-details]')
    await cornerDetails.waitFor({ timeout: 5_000 })
    await cornerDetails.locator('summary').click()
    const cornerGrid = run.locator('[data-corner-grid]')
    await cornerGrid.waitFor({ timeout: 5_000 })
    expect(await cornerGrid.locator('[data-corner-diagonal]').count()).toBeGreaterThan(0)
    expect(await cornerGrid.locator('[data-corner-cell]').count()).toBeGreaterThan(0)

    // The run's diagnostics fold into shared StatRow chips (`[data-stat="<key>"]`).
    const rhatStat = run.locator('[data-stat="rhat"]')
    await rhatStat.waitFor({ timeout: 5_000 })
    expect(await rhatStat.locator('[data-stat-value]').innerText()).toContain('1.002')
    const nEffStat = run.locator('[data-stat="n_eff"]')
    await nEffStat.waitFor({ timeout: 5_000 })
    expect(await nEffStat.locator('[data-stat-value]').innerText()).toContain('1,327')

    const spectrum = page.locator('[data-panel="spectrum"]')
    await spectrum.waitFor({ timeout: 10_000 })
    expect(await spectrum.count()).toBe(1)
    expect(await spectrum.locator('[data-panel-title]').innerText()).toBe('Spectrum')
    // The heatmap renders every cell (`[data-cell]`, the chart kit's HeatMap),
    // not the old hand-rolled `[data-spectrum-cell]` rects.
    await spectrum.locator('[data-cell]').first().waitFor({ timeout: 5_000 })
    expect(await spectrum.locator('[data-cell]').count()).toBeGreaterThan(0)

    const identifiability = page.locator('[data-panel="identifiability"]')
    await identifiability.waitFor({ timeout: 10_000 })
    expect(await identifiability.count()).toBe(1)
    expect(await identifiability.locator('[data-panel-title]').innerText()).toBe('Identifiability')
    // The singular-value spectrum renders as the chart kit's BarChart
    // (`[data-bar]`), not the old hand-rolled `[data-singular-value]` rects.
    await identifiability.locator('[data-bar]').first().waitFor({ timeout: 5_000 })
    expect(await identifiability.locator('[data-bar]').count()).toBeGreaterThan(0)

    // The new Chains panel (registered after Posterior) also occupies the
    // console.panel grid, sourced from the same seeded run.
    const chains = page.locator('[data-panel="chains"]')
    await chains.waitFor({ timeout: 10_000 })
    expect(await chains.count()).toBe(1)
    expect(await chains.locator('[data-panel-title]').innerText()).toBe('Chains')
    expect(await chains.locator('[data-chains-run][data-run-name="fit"]').count()).toBe(1)
  }, 60_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})

const LAYOUT_SEED_ID = 'rheplicant-ui-console-layout-web-e2e'

describe('web e2e: rheplicant console per-session panel layout (collapse, hide, persist, reset)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, realizeSeedFixture(scaffold, SEED_FIXTURE, LAYOUT_SEED_ID), LAYOUT_SEED_ID)
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

  it('collapses one panel, hides another, persists both across reload, then resets', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-console-layout'))

    // Open the seeded session and the Console view (same pattern as the load test above).
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
    await consoleView.locator('[data-console-grid]').waitFor({ timeout: 5_000 })

    // `console.panel` has no per-entry render API (renderSlot's `only` picks
    // exactly ONE entry, and a slot component cannot enumerate the registered
    // ledger at all — see ConsoleView.tsx's own module doc comment). The
    // layout view travels through the single shared owner-props object
    // instead, so only the occupants that actually READ it self-apply:
    // `gates` (ui-console), `posterior`/`chains` (ui-posterior). The other
    // three occupants (`signal-path`, `identifiability`, `spectrum`) accept
    // no `layout` prop at all and stay always-visible/always-expanded — an
    // honest degrade, not a bug. This scenario exercises the collapse/hide
    // contract ONLY on the three panels that actually honor it.
    const posterior = page.locator('[data-panel="posterior"]')
    await posterior.waitFor({ timeout: 10_000 })
    const chains = page.locator('[data-panel="chains"]')
    await chains.waitFor({ timeout: 10_000 })

    // --- Collapse Posterior: header stays, body is removed from the DOM. ---
    expect(await posterior.getAttribute('data-panel-collapsed')).toBeNull()
    await posterior.locator('[data-panel-body]').waitFor({ timeout: 5_000 })
    await posterior.locator('[data-panel-collapse-toggle]').click()
    expect(await posterior.getAttribute('data-panel-collapsed')).toBe('true')
    expect(await posterior.locator('[data-panel-body]').count()).toBe(0)
    // The header (title) stays, unlike a hidden panel.
    expect(await posterior.locator('[data-panel-title]').innerText()).toBe('Posterior')

    // --- Hide Chains via the Panels menu: it leaves the grid entirely. ---
    // Set `<details>.open` directly rather than clicking `summary` (a click
    // TOGGLES the native element — deterministic only if you already know
    // its current state, which a shared `page` across `it` blocks does not
    // guarantee).
    const menu = page.locator('[data-panels-menu]')
    await menu.waitFor({ timeout: 5_000 })
    await menu.evaluate((el) => { (el as HTMLDetailsElement).open = true })
    const chainsMenuItem = menu.locator('[data-panels-menu-item="chains"]')
    await chainsMenuItem.waitFor({ timeout: 5_000 })
    await chainsMenuItem.locator('input[type="checkbox"]').click()
    await expect.poll(() => chains.count(), { timeout: 5_000 }).toBe(0)
    // Posterior (still shown, just collapsed) is unaffected by hiding Chains.
    expect(await posterior.count()).toBe(1)
    await menu.evaluate((el) => { (el as HTMLDetailsElement).open = false }) // close the popover before reloading

    // --- Reload: BOTH the collapse and the hide must survive — that is the
    // whole point of the persisted store (`rheplicant.console.layout.<sessionId>`
    // in localStorage, per layout-store.ts). ---
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    // The session route persists across reload (same pattern used by
    // details-session-lifecycle.e2e.ts); re-select the Console tab defensively.
    await page.getByRole('tab', { name: 'Console', exact: true }).click()
    await consoleView.locator('[data-console-grid]').waitFor({ timeout: 15_000 })

    const posteriorAfterReload = page.locator('[data-panel="posterior"]')
    await posteriorAfterReload.waitFor({ timeout: 10_000 })
    expect(await posteriorAfterReload.getAttribute('data-panel-collapsed')).toBe('true')
    expect(await posteriorAfterReload.locator('[data-panel-body]').count()).toBe(0)
    expect(await page.locator('[data-panel="chains"]').count()).toBe(0)

    // --- Reset layout restores both. ---
    const menuAfterReload = page.locator('[data-panels-menu]')
    await menuAfterReload.waitFor({ timeout: 5_000 })
    await menuAfterReload.evaluate((el) => { (el as HTMLDetailsElement).open = true })
    await menuAfterReload.locator('[data-panels-menu-reset]').click()
    await expect.poll(() => posteriorAfterReload.getAttribute('data-panel-collapsed'), { timeout: 5_000 }).toBeNull()
    await posteriorAfterReload.locator('[data-panel-body]').waitFor({ timeout: 5_000 })
    await expect.poll(() => page.locator('[data-panel="chains"]').count(), { timeout: 5_000 }).toBe(1)
    // Leave the popover closed so the next `it` block (sharing this `page`)
    // starts from a known state rather than whatever this test happened to leave.
    await menuAfterReload.evaluate((el) => { (el as HTMLDetailsElement).open = false })
  }, 90_000)

  it('the Panels menu lists all six known occupants, but only three actually respond to hide', async () => {
    // Documents the real (not aspirational) DOM contract: `known-panels.ts`'s
    // roster is hand-maintained and lists every `console.panel` occupant that
    // exists today, regardless of whether that occupant reads the layout prop
    // at all. `gates`/`posterior`/`chains` do; `signal-path`/`identifiability`/
    // `spectrum` do not (their own Panel components accept no `layout` prop —
    // see SignalPathPanel.tsx, IdentifiabilityPanel.tsx, SpectrumPanel.tsx).
    // This is a menu-affordance gap (checking one of those three off still
    // shows a checkbox flip, but the panel never actually leaves the grid) —
    // reported here, not fixed here.
    const menu = page.locator('[data-panels-menu]')
    await menu.waitFor({ timeout: 10_000 })
    await menu.evaluate((el) => { (el as HTMLDetailsElement).open = true })
    const items = menu.locator('[data-panels-menu-item]')
    await expect.poll(() => items.count(), { timeout: 5_000 }).toBe(6)
    const ids = await items.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panels-menu-item')))
    expect(ids.sort()).toEqual(['chains', 'gates', 'identifiability', 'posterior', 'signal-path', 'spectrum'])

    // Toggle "Signal path" off: the menu accepts the click (it has no
    // per-panel gating of its own — every roster row is checkable), but the
    // panel — which never reads a `layout` prop — stays in the grid.
    const signalPathItem = menu.locator('[data-panels-menu-item="signal-path"]')
    await signalPathItem.waitFor({ timeout: 5_000 })
    expect(await page.locator('[data-panel="signal-path"]').count()).toBe(1)
    await signalPathItem.locator('input[type="checkbox"]').click()
    expect(await signalPathItem.locator('input[type="checkbox"]').isChecked()).toBe(false)
    // Give the (non-)effect a moment to (not) happen, then assert the panel
    // is still there — the broken affordance, made concrete.
    await page.waitForTimeout(300)
    expect(await page.locator('[data-panel="signal-path"]').count()).toBe(1)

    // Restore the checkbox state so this test does not leak into any test
    // that might run after it in this file.
    await signalPathItem.locator('input[type="checkbox"]').click()
    await menu.evaluate((el) => { (el as HTMLDetailsElement).open = false })
  }, 30_000)

  it('stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
