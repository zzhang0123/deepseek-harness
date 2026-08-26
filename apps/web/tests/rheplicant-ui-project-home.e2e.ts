// Web e2e: the project surface (`docs/project-model.md` §6.0) mounts into the
// two ADDITIVE root-scoped seats it claims, and — the part unit tests cannot
// check — mounting there shadows nothing. The shipped workspace picker and its
// directory-flow child slot are still present, which is exactly what §6.0's
// original `conversation.hero.workspace` choice would have destroyed.
//
// Since §20.2 the surface is a SECTION rather than a modal, and the assertions
// below are written for that: no backdrop, no Escape, a switch rather than a
// close, the frame behind still usable, and the section remembered across a
// reload. Each of those was a modal behaviour of OURS, so each is a thing that
// can quietly come back.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ProjectRuntime from '@rheplicant/dsh-rheplicant/project-runtime'
import * as projectApi from '@rheplicant/dsh-rheplicant/project-api'
import ComputeRuntime from '@rheplicant/dsh-rheplicant'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('web e2e: rheplicant project home', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ ...rheplicantFixtures() })
    // A task document in the scaffold's own workspace, so the home has
    // something real to list and something real to offer opening. The home
    // scans the whole workspace, so where it sits is the operator's business —
    // `tasks/` here only because that is the layout §7 describes.
    mkdirSync(join(scaffold.workspaceCwd, 'tasks'), { recursive: true })
    writeFileSync(join(scaffold.workspaceCwd, 'tasks', 'home-probe.yaml'), 'schema_version: 1\n')
    // The host half the home reads through. Without it the routes 404 and the
    // page correctly reports "not readable from here" — a real state, but not
    // the one this scenario is about.
    new ComputeRuntime(scaffold.ctx)
    new ProjectRuntime(scaffold.ctx)
    await scaffold.ctx.plugin(projectApi)
    // The scaffold gives sessions a working directory but registers no
    // WORKSPACE over it, and the home is addressed by workspace id — with an
    // empty registry its picker reads "no workspaces" and it never asks the
    // host anything. Registering one is what makes this a project.
    await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, 'e2e-project')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('lists the ui-project plugin in the browser boot roster', async () => {
    const roster = await page.evaluate(() => (window as unknown as {
      __DSH_BOOT__?: { entries?: { id?: string }[] }
    }).__DSH_BOOT__?.entries?.map(entry => entry.id) ?? [])
    expect(roster).toContain('@deepseek-ai/dsh-client-rheplicant-ui-project')
  })

  it('puts its section switch at the sidebar foot', async () => {
    await page.waitForSelector('[data-project-home-trigger]', { timeout: 15_000 })
    expect(await page.locator('[data-project-home-trigger]').count()).toBe(1)
    // A toggle button reporting its own state, not a disclosure revealing a
    // region beneath it (§20.2). `aria-expanded` would say the second thing.
    const trigger = page.locator('[data-project-home-trigger]')
    expect(await trigger.getAttribute('aria-pressed')).toBe('false')
    expect(await trigger.getAttribute('aria-expanded')).toBeNull()
  })

  it('starts on the conversation section, because nothing was remembered yet', async () => {
    // Not "renders nothing until pressed": the surface is a remembered SECTION
    // now, and the conversation is simply the section a fresh profile is on.
    expect(await page.locator('[data-project-home]').count()).toBe(0)
    expect(await page.locator('[data-project-section="conversation"]').count()).toBe(1)
  })

  it('switches to the project section and back', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // The page is real chrome, not a stub: its own picker and switch are there.
    expect(await page.locator('[data-project-picker]').count()).toBe(1)
    expect(await page.locator('[data-project-home-trigger]').getAttribute('aria-pressed')).toBe('true')
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('is a section, not a modal: no backdrop, no dialog role, and Escape does nothing', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    expect(await page.locator('[data-project-home-backdrop]').count()).toBe(0)
    // The role engine, not a `[role=…]` attribute selector: these roles are
    // IMPLICIT (a named `<section>` is a region), and an attribute selector
    // would report a landmark that is genuinely there as absent.
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(await page.getByRole('region', { name: 'Workbench' }).count()).toBe(1)
    await page.keyboard.press('Escape')
    // Still here. A modal would be gone.
    expect(await page.locator('[data-project-home]').count()).toBe(1)
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('leaves the sidebar switch reachable while the section is up — two peers, not one over the other', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // Clickable, not merely present: a backdrop or a full-bleed layer would
    // swallow this and the only way back would be the page's own header.
    await page.locator('[data-project-home-trigger]').click({ timeout: 5_000 })
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('remembers the section across a reload, which a modal must never do', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // ... and the project it was showing is NOT remembered: that is re-derived
    // from the host's own recent workspace, so a stale id can never pin it.
    expect(await page.evaluate(() => window.localStorage.getItem('rheplicant.project.section')))
      .toBe('project')
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('offers to open a conversation, now that a navigator is installed', async () => {
    // The affordance renders only when the plugin actually captured
    // `ctx.workspaces`/`ctx.sessions` in a real composition — which is the
    // part no unit test can assert, because it depends on the profile wiring.
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    await page.waitForSelector('[data-project-task="tasks/home-probe.yaml"]', { timeout: 15_000 })
    await page.waitForSelector('[data-project-open-task]', { timeout: 15_000 })
    // One control per TASK and none per execution: clicking a row already
    // shows it here, so a second "open a session" per row would be the same
    // action repeated down the page.
    expect(await page.locator('[data-project-open-task]').innerText()).toBe('Open in session')
    expect(await page.locator('[data-project-open-execution]').count()).toBe(0)
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('selects a task IN PLACE and reads its document, with no session involved', async () => {
    // The whole point of §11: a task the current conversation never touched is
    // not merely hidden under the old addressing, it is inexpressible.
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    await page.locator('[data-project-select-task="tasks/home-probe.yaml"]').click()
    await page.waitForSelector('[data-project-document]', { timeout: 15_000 })
    expect(await page.locator('[data-project-document]').innerText()).toContain('schema_version')
    // In place: the home is still open, nothing navigated.
    expect(await page.locator('[data-project-home]').count()).toBe(1)
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('carries the Panels menu, and hiding a panel persists across a reload', async () => {
    // §20.4: the layout store moved here from ui-loop's `conversation.view`
    // registration, and the SCOPE moved with it. It sat on a session-scoped
    // slot, so its persist key ended `.<sessionId>`; `shell.overlay` is
    // root-scoped, so this is one layout for the app — which is what hiding a
    // panel always meant. This scenario is the console layout scenario
    // retired from `rheplicant-ui-console-load.e2e.ts`, re-pointed at the
    // surface that owns the grid now.
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    const menu = page.locator('[data-panels-menu]')
    await menu.waitFor({ timeout: 15_000 })
    // The roster is hand-kept (no read API over a slot's entries), so its
    // contents are asserted rather than assumed.
    const ids = await menu.locator('[data-panels-menu-item]').evaluateAll(
      nodes => nodes.map(node => node.getAttribute('data-panels-menu-item')),
    )
    expect(ids).toEqual(['gates', 'signal-path', 'posterior', 'chains', 'identifiability', 'spectrum'])

    await menu.locator('summary').click()
    const spectrum = menu.locator('[data-panels-menu-item="spectrum"] input')
    expect(await spectrum.isChecked()).toBe(true)
    await spectrum.uncheck()
    expect(await spectrum.isChecked()).toBe(false)

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    // The section is remembered, so the surface comes back on its own.
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    const menuAfter = page.locator('[data-panels-menu]')
    await menuAfter.locator('summary').click()
    expect(await menuAfter.locator('[data-panels-menu-item="spectrum"] input').isChecked()).toBe(false)

    await menuAfter.locator('[data-panels-menu-reset]').click()
    expect(await menuAfter.locator('[data-panels-menu-item="spectrum"] input').isChecked()).toBe(true)
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('leaves the shipped workspace chip standing — this seat shadows nothing', async () => {
    // The assertion §6.0's original slot choice would have failed. Taking
    // `conversation.hero.workspace` would have replaced the shipped
    // WorkspacePicker (kind: 'single', replaceRisk: 'shadows-shipped-ui') and
    // taken its `directoryFlow` child slot down with it.
    const chip = page.locator('button', { hasText: /workspace/i })
    expect(await chip.count()).toBeGreaterThan(0)
  })
})
