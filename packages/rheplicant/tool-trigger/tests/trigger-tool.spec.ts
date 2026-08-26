import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { apply } from '@rheplicant/dsh-rheplicant-tool-trigger'
import { TRIGGERS_FILE, type TriggerRecord } from '@rheplicant/dsh-rheplicant/triggers'

let workspace: string
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'rheplicant-trigger-tool-')) })

/** The one tool the plugin registers, captured from a fake registry. */
function tool(): {
  call: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  render: (value: unknown) => string
} {
  let defined: {
    output: { render: (args: unknown, value: unknown) => { text: string }[] }
    execute: (args: unknown, exec: unknown) => Promise<Record<string, unknown>>
  } | undefined
  const ctx = {
    tools: { register: (definition: unknown) => { defined = definition as never } },
  } as never
  apply(ctx, {})
  if (defined === undefined) throw new Error('the plugin registered no tool')
  const registered = defined
  return {
    call: args => registered.execute(args, { agent: { session: { header: { cwd: workspace } } } }),
    render: value => registered.output.render({}, value)[0]?.text ?? '',
  }
}

/** What the registry file holds now. */
function stored(): TriggerRecord[] {
  return JSON.parse(readFileSync(join(workspace, TRIGGERS_FILE), 'utf8')) as TriggerRecord[]
}

describe('writing the registry', () => {
  it('creates a trigger and reports the file it wrote', async () => {
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'nightly', task: 'tasks/demo.yaml', every: 'P1D' })
    expect(stored()).toEqual([{ name: 'nightly', task: 'tasks/demo.yaml', every: 'P1D', enabled: true }])
    // Announced once, naming the file — §9.1's rule for the managed
    // `.gitignore`, for the same reason: a silent write to a file the user owns
    // is the wrongness §4.4 refuses.
    expect(render(result)).toContain(TRIGGERS_FILE)
  })

  it('says the limitation on every answer that has a live trigger in it', async () => {
    // The design's one non-negotiable (§6): a schedule that silently does not
    // run is worse than no schedule, so the caveat travels with the cadence.
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'n', task: 't.yaml', every: 'PT10M' })
    expect(render(result)).toContain('only while this harness is running')
  })

  it('replaces by NAME, so a trigger is not duplicated by re-setting it', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'n', task: 'a.yaml', every: 'PT10M' })
    await call({ action: 'set', name: 'n', task: 'b.yaml', every: 'PT20M' })
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).toMatchObject({ task: 'b.yaml', every: 'PT20M' })
  })

  it('KEEPS the firing history across a replace', async () => {
    // Changing a cadence must not run the task now. Forgetting `lastFiredAt`
    // would make the next tick fire immediately, which nobody asked for.
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, TRIGGERS_FILE), JSON.stringify([
      { name: 'n', task: 'a.yaml', every: 'PT10M', enabled: true, lastFiredAt: '2026-08-26T11:00:00Z' },
    ]))
    const { call } = tool()
    await call({ action: 'set', name: 'n', task: 'a.yaml', every: 'PT30M' })
    expect(stored()[0]?.lastFiredAt).toBe('2026-08-26T11:00:00Z')
  })

  it('accepts a task that does not exist yet, on purpose', async () => {
    // A trigger NAMES a task (design §3): one may be written before the
    // document it runs, and one whose task later disappears must survive to
    // SAY so. Refusing here would make that state unreachable.
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', task: 'not/written/yet.yaml', every: 'P1D' }))
      .resolves.toBeDefined()
  })

  it('disables without removing, and enables again', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'n', task: 't.yaml', every: 'P1D' })
    await call({ action: 'disable', name: 'n' })
    expect(stored()[0]?.enabled).toBe(false)
    await call({ action: 'enable', name: 'n' })
    expect(stored()[0]?.enabled).toBe(true)
  })

  it('removes only the one named', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'a', task: 't.yaml', every: 'P1D' })
    await call({ action: 'set', name: 'b', task: 't.yaml', every: 'P1D' })
    await call({ action: 'remove', name: 'a' })
    expect(stored().map(row => row.name)).toEqual(['b'])
  })

  it('lists without writing anything', async () => {
    const { call, render } = tool()
    const result = await call({ action: 'list' })
    expect(render(result)).not.toContain('Wrote')
    expect(() => stored()).toThrow()
  })
})

describe('what it refuses', () => {
  it('refuses to touch an UNREADABLE registry rather than overwriting it', async () => {
    // Writing over a file we could not parse would delete schedules the person
    // set and report success — the loudest version of the failure the design
    // leads with. Repair is a human's call.
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, TRIGGERS_FILE), '{ not json')
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', task: 't.yaml', every: 'P1D' }))
      .rejects.toThrow(/refusing to touch/)
    // And the bytes are still there to be repaired.
    expect(readFileSync(join(workspace, TRIGGERS_FILE), 'utf8')).toBe('{ not json')
  })

  it('refuses a cadence it cannot act on, and says why', async () => {
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', task: 't.yaml', every: 'P1M' }))
      .rejects.toThrow(/28 to 31 days/)
  })

  it('refuses a set with no task or no cadence', async () => {
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', task: 't.yaml' })).rejects.toThrow()
    await expect(call({ action: 'set', name: 'n', every: 'P1D' })).rejects.toThrow()
  })

  it('refuses to change a trigger that is not there, rather than creating one', async () => {
    const { call } = tool()
    await expect(call({ action: 'disable', name: 'ghost' })).rejects.toThrow(/no trigger named/)
    await expect(call({ action: 'remove', name: 'ghost' })).rejects.toThrow(/no trigger named/)
  })

  it('refuses an action it does not know, naming the ones it does', async () => {
    const { call } = tool()
    await expect(call({ action: 'fire', name: 'n' })).rejects.toThrow(/set, disable, enable, remove or list/)
  })

  it('refuses a session with no directory, because there is no project', async () => {
    const { call: _unused } = tool()
    const ctx = { tools: { register: () => {} } } as never
    let defined: { execute: (a: unknown, e: unknown) => Promise<unknown> } | undefined
    apply({ tools: { register: (d: unknown) => { defined = d as never } } } as never, {})
    void ctx
    await expect(defined?.execute({ action: 'list' }, { agent: undefined }))
      .rejects.toThrow(/no working directory/)
  })
})
