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

describe('keeping the registry out of git', () => {
  /** Make the workspace look like a git working tree. */
  function asRepository(): void {
    mkdirSync(join(workspace, '.git'), { recursive: true })
  }

  it('ignores its own file, so a schedule is never untracked source', async () => {
    // The registry lives in the state directory. Without this the very first
    // `rheplicant_trigger` call would leave a new untracked file in a
    // repository this layer does not own — the littering §9.1 exists to stop.
    asRepository()
    const { call } = tool()
    await call({ action: 'set', name: 'nightly', task: 'tasks/demo.yaml', every: 'P1D' })

    const ignore = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(ignore).toContain('/.rheplicant-agent/')
  })

  it('names the .gitignore it touched, because that file is not ours', async () => {
    asRepository()
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'nightly', task: 'tasks/demo.yaml', every: 'P1D' })

    expect(render(result)).toContain('.gitignore')
    expect(render(result)).toContain('stays out of git')
  })

  it('says nothing about a .gitignore on the second call, having written it once', async () => {
    asRepository()
    const { call, render } = tool()
    await call({ action: 'set', name: 'a', task: 'a.yaml', every: 'P1D' })
    const second = await call({ action: 'set', name: 'b', task: 'b.yaml', every: 'P1D' })

    expect(render(second)).not.toContain('stays out of git')
  })

  it('writes no .gitignore at all outside a repository', async () => {
    // Nothing here runs `git`, and creating a `.gitignore` in a directory that
    // is not a working tree would be a file nobody asked for.
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'n', task: 't.yaml', every: 'P1D' })

    expect(() => readFileSync(join(workspace, '.gitignore'), 'utf8')).toThrow()
    expect(render(result)).not.toContain('stays out of git')
  })

  it('does not touch a .gitignore for a read', async () => {
    asRepository()
    const { call, render } = tool()
    const result = await call({ action: 'list' })

    expect(() => readFileSync(join(workspace, '.gitignore'), 'utf8')).toThrow()
    expect(render(result)).not.toContain('stays out of git')
  })
})

describe('scheduling a routine instead of a task', () => {
  it('writes a routine when given a prompt, with no task field at all', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'brief', prompt: 'Check the overnight fits', every: 'PT30M' })
    expect(stored()).toEqual([
      { name: 'brief', every: 'PT30M', enabled: true, action: 'routine', prompt: 'Check the overnight fits' },
    ])
  })

  it('renders what a routine will SAY, since it has no task to name', async () => {
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'brief', prompt: 'Check the overnight fits', every: 'PT30M' })
    expect(render(result)).toContain('routine "Check the overnight fits"')
  })

  it('clips a long prompt in the listing rather than reading it back', async () => {
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'brief', prompt: 'x'.repeat(200), every: 'PT30M' })
    const line = render(result).split('\n').find(row => row.includes('brief')) ?? ''
    expect(line.length).toBeLessThan(140)
    expect(line).toContain('…')
  })

  it('still says the limitation, which is not about which kind it is', async () => {
    const { call, render } = tool()
    const result = await call({ action: 'set', name: 'brief', prompt: 'anything', every: 'PT30M' })
    expect(render(result)).toContain('Triggers fire only while this harness is running.')
  })

  it('refuses BOTH a task and a prompt, rather than silently preferring one', async () => {
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', task: 't.yaml', prompt: 'hi', every: 'PT30M' }))
      .rejects.toThrow(/exactly one/)
  })

  it('refuses a routine faster than the floor, and says a task trigger has none', async () => {
    const { call } = tool()
    await expect(call({ action: 'set', name: 'n', prompt: 'hi', every: 'PT1M' }))
      .rejects.toThrow(/PT5M/)
  })

  it('lets a TASK trigger keep a cadence a routine could not have', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'fast', task: 't.yaml', every: 'PT30S' })
    expect(stored()[0]!.every).toBe('PT30S')
  })

  it('replaces a task trigger with a routine WHOLE, carrying no stale task across', async () => {
    // A routine that kept a `task` would render as a task run on every surface
    // that draws one.
    const { call } = tool()
    await call({ action: 'set', name: 'n', task: 't.yaml', every: 'PT30M' })
    await call({ action: 'set', name: 'n', prompt: 'now a routine', every: 'PT30M' })
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).not.toHaveProperty('task')
  })

  it('keeps the firing history when the kind changes, so it does not fire at once', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'n', task: 't.yaml', every: 'PT30M' })
    writeFileSync(join(workspace, TRIGGERS_FILE),
      JSON.stringify([{ ...stored()[0], lastFiredAt: '2026-08-27T00:00:00.000Z' }]))
    await call({ action: 'set', name: 'n', prompt: 'now a routine', every: 'PT30M' })
    expect(stored()[0]!.lastFiredAt).toBe('2026-08-27T00:00:00.000Z')
  })

  it('disables and removes a routine by the same name-keyed route', async () => {
    const { call } = tool()
    await call({ action: 'set', name: 'brief', prompt: 'hi', every: 'PT30M' })
    await call({ action: 'disable', name: 'brief' })
    expect(stored()[0]!.enabled).toBe(false)
    await call({ action: 'remove', name: 'brief' })
    expect(stored()).toEqual([])
  })
})
