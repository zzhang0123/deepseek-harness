// Web e2e: the one edge out of a chat result and into the project surface
// (`docs/project-model.md` §20.3).
//
// The tension §20 opens with is "sometimes I want to see the consequence right
// now", against a project-centric frame. The answer is that the immediate view
// was never the console: the chat result node is the only surface anchored to
// the turn that CAUSED a result, and what it lacked was a way to go DEEPER.
//
// The part no unit test can assert is the part this covers: the action reaches
// across two separate client BUNDLES. ui-analysis cannot import ui-project —
// the bundle purity gate refuses cross-plugin value imports outright — so the
// edge runs over two cordis services, and whether those resolve at all depends
// on the real composition and its mount order.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import ProjectRuntime from '@rheplicant/dsh-rheplicant/project-runtime'
import * as projectApi from '@rheplicant/dsh-rheplicant/project-api'
import ComputeRuntime from '@rheplicant/dsh-rheplicant'
import { rheplicantFixtures } from './rheplicant-fixtures.ts'
import {
  launchWebScaffold, realizeSeedFixture, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'rheplicant-open-in-project-web-e2e'
const TASK_PATH = 'tasks/global-signal-fit.yaml'
const EXECUTION = '20260823T101500Z-3f9ac2b1-k7m2xq'
// A run against a task file PUBLISHES, so its outcome names a results folder
// and `receipt()` has stripped its arrays — which is what makes the project
// view the place to see them, and what makes this node offer a way there.
const OUTCOME = '{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.01,"n_eff":500,"divergences":0,"notes":[]}}],"tookMs":31,"resultsPath":"results/tasks/global-signal-fit/20260823T101500Z-3f9ac2b1-k7m2xq"}'
const IDENTITY = `"executionId":"${EXECUTION}","taskDigest":"3f9ac2b1","taskPath":"${TASK_PATH}"`

const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974500747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974500758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974500759,"data":{"content":[{"type":"text","text":"Run the fit."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974500827,"data":{"turn":1,"step":1}}',
  `{"type":"rheplicant/run","seq":3,"time":1784974500828,"ignorable":true,"data":{"document":{},"outcome":${OUTCOME},"transport":"local",${IDENTITY}}}`,
  '{"type":"assistant/message","seq":4,"time":1784974500829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The fit completed."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974500830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974500831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('web e2e: a chat result opens in the project view', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ ...rheplicantFixtures() })
    // The task the seeded run names, as a real file: the project surface reads
    // the document off the tree, so this is what makes "it arrived selected"
    // observable rather than merely asserted about a store.
    mkdirSync(join(scaffold.workspaceCwd, 'tasks'), { recursive: true })
    writeFileSync(join(scaffold.workspaceCwd, TASK_PATH), 'schema_version: 1\nruns: []\n')
    const sessionId = await seedSession(
      scaffold, realizeSeedFixture(scaffold, SEED_FIXTURE, SEED_ID), SEED_ID,
    )
    // The host half the project surface reads through. Without it the routes
    // 404 and the page correctly reports "not readable from here" — a real
    // state, but not the one this scenario is about.
    new ComputeRuntime(scaffold.ctx)
    new ProjectRuntime(scaffold.ctx)
    await scaffold.ctx.plugin(projectApi, {})
    // The action is addressed by WORKSPACE, so the seeded session has to be in
    // one: the selection belongs to a project, and a session in no project has
    // nothing to select into. The scaffold's registry bootstraps from the
    // headers present at boot, and this session was seeded after it, so the
    // membership is stated explicitly here.
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, 'e2e-project')
    await workspace.attachSession(sessionId)
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

  it('offers the action on the result node, addressed to that execution', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-open-in-project'))
    // This scaffold registers a REAL workspace (the action is addressed by one),
    // so the sidebar shows a workspace group rather than the bare session list
    // the seed-only scenarios see. The group renders expanded before its rows
    // have loaded, so collapse and re-expand it rather than reading
    // `aria-expanded`, which is true while the tree is still one row.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    const rows = page.locator('[role="treeitem"]')
    await groupRow.click()
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(1)
    await groupRow.click()
    // The workspace's own blank session, then the seeded one.
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThan(2)
    await rows.last().click()
    await page.getByText('Run the fit.', { exact: true }).waitFor({ timeout: 10_000 })

    const node = page.locator('[data-rheplicant-analysis]')
    await node.waitFor({ timeout: 15_000 })
    const action = node.locator('[data-open-in-project]')
    await action.waitFor({ timeout: 10_000 })
    // One per NODE, not per run: every run in one node came from one event.
    expect(await action.count()).toBe(1)
    expect(await action.getAttribute('data-open-in-project')).toBe(EXECUTION)
    expect(await action.getAttribute('data-open-in-project-task')).toBe(TASK_PATH)
  })

  it('switches to the project section with that task already selected', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rheplicant-open-in-project-switch'))
    // Not showing yet: the section is where the reader is, and they are in the
    // conversation.
    expect(await page.locator('[data-project-home]').count()).toBe(0)
    await page.locator('[data-open-in-project]').click()
    await page.waitForSelector('[data-project-home]', { timeout: 15_000 })
    // Arrived on the task the RESULT named, not on whatever the surface had
    // chosen before — which is the whole difference between this and a button
    // that merely opens the page.
    await page.waitForSelector(`[data-project-select-task="${TASK_PATH}"]`, { timeout: 15_000 })
    const document_ = page.locator('[data-project-document]')
    await document_.waitFor({ timeout: 15_000 })
    expect(await document_.innerText()).toContain('schema_version')
  })

  it('leaves the conversation standing behind it — a section, not a modal', async () => {
    // The chat the result came from is still mounted and the frame is intact:
    // this is the assertion that the surface stopped being an interruption.
    expect(await page.locator('[class*="frame"]').count()).toBe(1)
    expect(await page.locator('[data-project-home-backdrop]').count()).toBe(0)
    expect(await page.locator('[data-project-home-trigger]').getAttribute('aria-pressed')).toBe('true')
    await page.locator('[data-project-switch]').click()
    await page.waitForSelector('[data-project-home]', { state: 'detached', timeout: 15_000 })
    await page.locator('[data-rheplicant-analysis]').waitFor({ timeout: 10_000 })
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
