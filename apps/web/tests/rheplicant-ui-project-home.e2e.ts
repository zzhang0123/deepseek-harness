// Web e2e: the project home (`docs/project-model.md` §6.0) mounts into the two
// ADDITIVE root-scoped seats it claims, and — the part unit tests cannot check
// — mounting there shadows nothing. The shipped workspace picker and its
// directory-flow child slot are still present, which is exactly what §6.0's
// original `conversation.hero.workspace` choice would have destroyed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ProjectRuntime from '@rheplicant/dsh-rheplicant/project-runtime'
import * as projectApi from '@rheplicant/dsh-rheplicant/project-api'
import ComputeRuntime from '@rheplicant/dsh-rheplicant'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe('web e2e: rheplicant project home', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
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
    await scaffold.ctx.plugin(projectApi, {})
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

  it('puts its trigger at the sidebar foot', async () => {
    await page.waitForSelector('[data-project-home-trigger]', { timeout: 15_000 })
    expect(await page.locator('[data-project-home-trigger]').count()).toBe(1)
  })

  it('renders nothing until the trigger is pressed, so the overlay stays click-through', async () => {
    expect(await page.locator('[data-project-home]').count()).toBe(0)
  })

  it('opens the archive page on the trigger and closes it again', async () => {
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // The page is real chrome, not a stub: its own picker and Close are there.
    expect(await page.locator('[data-project-picker]').count()).toBe(1)
    await page.locator('[data-project-close]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
  })

  it('offers to open a project, now that a navigator is installed', async () => {
    // The affordance renders only when the plugin actually captured
    // `ctx.workspaces`/`ctx.sessions` in a real composition — which is the
    // part no unit test can assert, because it depends on the profile wiring.
    await page.locator('[data-project-home-trigger]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    await page.waitForSelector('[data-project-task="tasks/home-probe.yaml"]', { timeout: 15_000 })
    // A never-run task: the affordance opens the project and asks for no
    // execution, because there is none to point at.
    await page.waitForSelector('[data-project-open-task]', { timeout: 15_000 })
    expect(await page.locator('[data-project-open-task]').innerText()).toBe('Open project')
    await page.locator('[data-project-close]').click()
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
