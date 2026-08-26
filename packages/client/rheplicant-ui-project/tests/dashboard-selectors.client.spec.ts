import { describe, expect, it } from 'vitest'
import {
  allExecutions, allTasks, allTriggers, kindsPresent, matchesKind, neverRun,
  nextFireLabel, orphanTriggers, projectTotals, triggersForTask, unreadableRegistries,
  type DashboardExecution, type DashboardTask, type DashboardTrigger,
} from '../src/client/dashboard-selectors.ts'
import type { ProjectCard } from '../src/client/use-all-projects.ts'
import type { ProjectTriggerRow } from '@rheplicant/dsh-rheplicant/types'

/** One execution row, with only what a given assertion needs stated. */
function execution(over: Partial<DashboardExecution> = {}): DashboardExecution {
  return {
    executionId: 'E1', task: 'tasks/demo', status: 'ok', path: 'results/tasks/demo/E1/',
    workspaceId: 'ws-1', project: 'alpha', ...over,
  }
}

/** One task row, with only what a given assertion needs stated. */
function task(over: Partial<DashboardTask> = {}): DashboardTask {
  return {
    path: 'tasks/demo.yaml', bytes: 100, modifiedAt: '2026-01-01T00:00:00Z',
    executionCount: 0, workspaceId: 'ws-1', project: 'alpha', ...over,
  }
}

/** One trigger row, with only what a given assertion needs stated. */
function trigger(over: Partial<ProjectTriggerRow> = {}): ProjectTriggerRow {
  return { name: 'nightly', task: 'tasks/demo.yaml', every: 'P1D', enabled: true, ...over }
}

/**
 * One project card, readable unless `overview` is explicitly undefined.
 *
 * `triggers` defaults to a registry that is ABSENT rather than one that is
 * missing: most assertions here are about tasks and executions, and a card with
 * no registry answer at all would exercise the route-unreachable path by
 * accident.
 */
function card(
  over: Partial<ProjectCard> & {
    executions?: DashboardExecution[]
    tasks?: DashboardTask[]
    scheduled?: ProjectTriggerRow[]
  } = {},
): ProjectCard {
  const { executions, tasks, scheduled, ...rest } = over
  return {
    workspaceId: 'ws-1',
    title: 'alpha',
    overview: {
      project: 'alpha', tasks: tasks ?? [], inputs: [], truncated: false,
      executions: executions ?? [],
    },
    triggers: scheduled === undefined
      ? { project: 'alpha', state: 'absent', triggers: [] }
      : { project: 'alpha', state: 'ok', triggers: scheduled },
    ...rest,
  }
}

describe('project totals', () => {
  it('counts each status separately, because they are different outcomes', () => {
    const totals = projectTotals(card({
      executions: [
        execution({ status: 'ok' }), execution({ status: 'ok' }),
        execution({ status: 'refused' }), execution({ status: 'error' }),
      ],
    }))
    expect(totals).toMatchObject({ executions: 4, ok: 2, refused: 1, error: 1 })
  })

  it('answers UNDEFINED, never zero, for a project it could not read', () => {
    // The distinction this whole surface rests on: an empty project answers
    // with empty lists, an unreadable one answers with nothing. A card
    // rendering "0 tasks" for the second states something it does not know.
    const totals = projectTotals(card({ overview: undefined }))
    expect(totals.tasks).toBeUndefined()
    expect(totals.executions).toBeUndefined()
    expect(totals.ok).toBeUndefined()
  })

  it('answers zero for a project that genuinely holds nothing', () => {
    expect(projectTotals(card()).executions).toBe(0)
  })

  it('carries `truncated` through, so a partial listing cannot read as a small project', () => {
    const partial = card()
    const totals = projectTotals({
      ...partial,
      overview: { ...partial.overview!, truncated: true },
    })
    expect(totals.truncated).toBe(true)
  })
})

describe('the cross-project execution list', () => {
  it('flattens every readable project and tags each row with its own', () => {
    const rows = allExecutions([
      card({ workspaceId: 'ws-1', executions: [execution({ executionId: 'A' })] }),
      { ...card({ workspaceId: 'ws-2' }), overview: {
        project: 'beta', tasks: [], inputs: [], truncated: false,
        executions: [execution({ executionId: 'B', project: 'beta' })],
      } },
    ])
    expect(rows.map(row => row.executionId).sort()).toEqual(['A', 'B'])
    expect(rows.find(row => row.executionId === 'B')?.workspaceId).toBe('ws-2')
  })

  it('skips an unreadable project without dropping the others', () => {
    // One project that cannot be read must not blank a dashboard of several —
    // the reason each is fetched separately in the first place.
    const rows = allExecutions([
      card({ overview: undefined }),
      card({ workspaceId: 'ws-2', executions: [execution({ executionId: 'B' })] }),
    ])
    expect(rows).toHaveLength(1)
  })

  it('sorts newest first, and puts rows with NO timestamp last', () => {
    const rows = allExecutions([card({
      executions: [
        execution({ executionId: 'old', startedAt: '2026-01-01T00:00:00Z' }),
        execution({ executionId: 'none' }),
        execution({ executionId: 'new', startedAt: '2026-08-01T00:00:00Z' }),
      ],
    })])
    // A missing timestamp means our sidecar never recorded one. Sorting those
    // first would let the least-described rows dominate the view.
    expect(rows.map(row => row.executionId)).toEqual(['new', 'old', 'none'])
  })
})

describe('the analysis facet', () => {
  it('offers only kinds that actually ran, in first-appearance order', () => {
    // The vocabulary comes from the DATA. A filter offering a kind nobody has
    // run would be the hand-kept catalogue of upstream's grammar that §18.2
    // forbids, wearing a different name.
    const rows = allExecutions([card({
      executions: [
        execution({ executionId: 'A', kinds: ['forward', 'nuts'] }),
        execution({ executionId: 'B', kinds: ['forward'] }),
      ],
    })])
    expect(kindsPresent(rows)).toEqual(['forward', 'nuts'])
  })

  it('offers nothing when no execution recorded its kinds', () => {
    const rows = allExecutions([card({ executions: [execution()] })])
    expect(kindsPresent(rows)).toEqual([])
  })

  it('matches every row when no kind is chosen', () => {
    expect(matchesKind(execution(), undefined)).toBe(true)
    expect(matchesKind(execution({ kinds: ['nuts'] }), undefined)).toBe(true)
  })

  it('excludes a row whose kinds are UNKNOWN rather than smuggling it into every filter', () => {
    // An execution published before the sidecar carried `kinds` records none.
    // Including it in every filter would quietly answer "everything we cannot
    // rule out" while looking like "everything that ran this".
    expect(matchesKind(execution(), 'forward')).toBe(false)
    expect(matchesKind(execution({ kinds: [] }), 'forward')).toBe(false)
  })

  it('matches on membership, not on the first kind', () => {
    expect(matchesKind(execution({ kinds: ['forward', 'nuts'] }), 'nuts')).toBe(true)
    expect(matchesKind(execution({ kinds: ['forward', 'nuts'] }), 'fisher')).toBe(false)
  })
})

describe('the cross-project task list (the Setups tab)', () => {
  it('sorts by MODIFICATION, newest first — not by when anything ran', () => {
    // A setups listing answers "what am I working on". Sorting by run recency
    // would bury the task somebody is in the middle of defining, which is
    // exactly the one that has no runs yet.
    const rows = allTasks([card({
      tasks: [
        task({ path: 'old.yaml', modifiedAt: '2026-01-01T00:00:00Z', executionCount: 9 }),
        task({ path: 'new.yaml', modifiedAt: '2026-08-01T00:00:00Z', executionCount: 0 }),
      ],
    })])
    expect(rows.map(row => row.path)).toEqual(['new.yaml', 'old.yaml'])
  })

  it('tags each task with the project it belongs to', () => {
    const rows = allTasks([
      card({ workspaceId: 'ws-1', tasks: [task({ path: 'a.yaml' })] }),
      { ...card({ workspaceId: 'ws-2' }), overview: {
        project: 'beta', tasks: [task({ path: 'b.yaml', project: 'beta' })],
        inputs: [], truncated: false, executions: [],
      } },
    ])
    expect(rows.find(row => row.path === 'b.yaml')?.workspaceId).toBe('ws-2')
    expect(rows.find(row => row.path === 'b.yaml')?.project).toBe('beta')
  })

  it('skips an unreadable project rather than inventing empty tasks for it', () => {
    const rows = allTasks([card({ overview: undefined }), card({ tasks: [task()] })])
    expect(rows).toHaveLength(1)
  })

  it('reads a zero execution count as genuinely never run', () => {
    // No third state to confuse this with: an unreadable project contributes
    // no tasks at all, so a task that IS here came with a real count.
    expect(neverRun(task({ executionCount: 0 }))).toBe(true)
    expect(neverRun(task({ executionCount: 1 }))).toBe(false)
  })
})

describe('what a project has scheduled', () => {
  it('carries the cadence verbatim, and the trigger name as its identity', () => {
    const [only] = allTriggers([card({ scheduled: [trigger({ name: 'ten', every: 'PT10M' })] })])
    expect(only?.name).toBe('ten')
    expect(only?.every).toBe('PT10M')
  })

  it('contributes nothing from a project with no registry', () => {
    expect(allTriggers([card()])).toEqual([])
  })

  it('contributes nothing from a registry that could not be READ, and says so separately', () => {
    // `absent` and `unreadable` both mean nothing fires, and a surface that
    // showed them the same way would render a corrupt file as "this project has
    // no schedules" — a confident answer to a question nothing could answer.
    const corrupt = card({
      triggers: { project: 'alpha', state: 'unreadable', triggers: [], reason: 'the file is not valid JSON' },
    })
    expect(allTriggers([corrupt])).toEqual([])
    expect(unreadableRegistries([corrupt])).toEqual([
      { workspaceId: 'ws-1', project: 'alpha', reason: 'the file is not valid JSON' },
    ])
  })

  it('does not report a project whose triggers route could not be reached at all', () => {
    // Its card already says it could not be read; saying it twice would read
    // as two faults where there is one.
    expect(unreadableRegistries([card({ triggers: undefined })])).toEqual([])
  })

  it('names the project from the registry answer, so an unreadable overview still labels it', () => {
    const [only] = allTriggers([card({
      overview: undefined,
      triggers: { project: 'beta', state: 'ok', triggers: [trigger()] },
    })])
    expect(only?.project).toBe('beta')
  })
})

describe('whether the task a trigger names is there', () => {
  it('is PRESENT when the listing holds it', () => {
    const [only] = allTriggers([card({
      tasks: [task({ path: 'tasks/demo.yaml' })],
      scheduled: [trigger({ task: 'tasks/demo.yaml' })],
    })])
    expect(only?.taskPresence).toBe('present')
  })

  it('is MISSING when a complete listing does not', () => {
    // The state that made identity the trigger's own name rather than the task
    // path: keyed by path, this would be unrepresentable rather than merely
    // wrong.
    const [only] = allTriggers([card({
      tasks: [task({ path: 'tasks/other.yaml' })],
      scheduled: [trigger({ task: 'tasks/deleted.yaml' })],
    })])
    expect(only?.taskPresence).toBe('missing')
  })

  it('is UNKNOWN when a scan cap truncated the listing', () => {
    // Absence from a partial listing is not evidence of absence, and rendering
    // it as "names a task that is not here" would state a fact nothing
    // established.
    const partial = card({ scheduled: [trigger({ task: 'tasks/deleted.yaml' })] })
    const [only] = allTriggers([{
      ...partial,
      overview: { ...partial.overview!, truncated: true },
    }])
    expect(only?.taskPresence).toBe('unknown')
  })

  it('is PRESENT even from a truncated listing, because presence is conclusive', () => {
    const partial = card({
      tasks: [task({ path: 'tasks/demo.yaml' })],
      scheduled: [trigger({ task: 'tasks/demo.yaml' })],
    })
    const [only] = allTriggers([{
      ...partial,
      overview: { ...partial.overview!, truncated: true, tasks: partial.overview!.tasks },
    }])
    expect(only?.taskPresence).toBe('present')
  })

  it('is UNKNOWN when the project could not be listed at all', () => {
    const [only] = allTriggers([card({
      overview: undefined,
      triggers: { project: 'alpha', state: 'ok', triggers: [trigger()] },
    })])
    expect(only?.taskPresence).toBe('unknown')
  })

  it('matches a task written with a leading ./, which the listing never carries', () => {
    // The registry holds whatever the agent wrote. Compared raw, this trigger
    // would report its own task missing — the one state on this surface that
    // must never be wrong.
    const [only] = allTriggers([card({
      tasks: [task({ path: 'tasks/demo.yaml' })],
      scheduled: [trigger({ task: './tasks/demo.yaml' })],
    })])
    expect(only?.taskPresence).toBe('present')
  })
})

describe('attaching schedules to rows', () => {
  it('gives a task only the triggers from its OWN project', () => {
    const triggers = allTriggers([
      card({ tasks: [task()], scheduled: [trigger({ name: 'mine' })] }),
      {
        workspaceId: 'ws-2',
        title: 'beta',
        overview: { project: 'beta', tasks: [], inputs: [], executions: [], truncated: false },
        triggers: { project: 'beta', state: 'ok', triggers: [trigger({ name: 'theirs' })] },
      },
    ])
    const attached = triggersForTask(triggers, task({ workspaceId: 'ws-1', path: 'tasks/demo.yaml' }))
    expect(attached.map(row => row.name)).toEqual(['mine'])
  })

  it('gives a task with nothing scheduled an empty list, never a placeholder', () => {
    // The row renders EMPTY, not "manual": nothing persists "this one is run by
    // hand", so a word there would be an invented uniformity.
    const triggers = allTriggers([card({ tasks: [task()] })])
    expect(triggersForTask(triggers, task())).toEqual([])
  })

  it('gives one task both of the triggers that name it', () => {
    const triggers = allTriggers([card({
      tasks: [task()],
      scheduled: [trigger({ name: 'a' }), trigger({ name: 'b', every: 'PT10M' })],
    })])
    expect(triggersForTask(triggers, task()).map(row => row.name)).toEqual(['a', 'b'])
  })

  it('sends every trigger with no task row to the orphan list, whichever way it lacks one', () => {
    const triggers = allTriggers([card({
      tasks: [task({ path: 'tasks/demo.yaml' })],
      scheduled: [
        trigger({ name: 'attached', task: 'tasks/demo.yaml' }),
        trigger({ name: 'gone', task: 'tasks/deleted.yaml' }),
      ],
    })])
    expect(orphanTriggers(triggers).map(row => row.name)).toEqual(['gone'])
  })
})

describe('when a trigger next fires', () => {
  const NOON = Date.parse('2026-08-26T12:00:00.000Z')

  /** One dashboard trigger, at the presence a next-fire label never reads. */
  function row(over: Partial<DashboardTrigger> = {}): DashboardTrigger {
    return {
      ...trigger(), workspaceId: 'ws-1', project: 'alpha', taskPresence: 'present', ...over,
    }
  }

  it('says `disabled` before it says anything about time', () => {
    expect(nextFireLabel(row({ enabled: false, nextFireAt: '2026-08-26T13:00:00.000Z' }), NOON))
      .toBe('disabled')
  })

  it('says `due now` for a window that has passed, not a date in the past', () => {
    // Overdue and never-fired are the same fact — the next window is at or
    // before now — and the difference is not something a person acts on.
    expect(nextFireLabel(row({ nextFireAt: '2020-01-01T00:00:00.000Z' }), NOON)).toBe('due now')
  })

  it('says `due now` at the boundary itself', () => {
    expect(nextFireLabel(row({ nextFireAt: '2026-08-26T12:00:00.000Z' }), NOON)).toBe('due now')
  })

  it('counts in minutes, hours and days as the wait grows', () => {
    expect(nextFireLabel(row({ nextFireAt: '2026-08-26T12:00:30.000Z' }), NOON)).toBe('in under a minute')
    expect(nextFireLabel(row({ nextFireAt: '2026-08-26T12:08:00.000Z' }), NOON)).toBe('in 8 min')
    expect(nextFireLabel(row({ nextFireAt: '2026-08-26T15:00:00.000Z' }), NOON)).toBe('in 3 h')
    expect(nextFireLabel(row({ nextFireAt: '2026-08-29T12:00:00.000Z' }), NOON)).toBe('in 3 d')
  })

  it('says the next fire is unknown rather than inventing one', () => {
    // Unreachable from a registry the host read as `ok` — an unusable cadence
    // makes the whole file unreadable — but this value crossed a process
    // boundary, so it is answered rather than assumed away.
    // OMITTED, not explicitly `undefined`: the field is optional under
    // `exactOptionalPropertyTypes`, so passing the word is a type error — and
    // absent is the state the wire actually produces.
    expect(nextFireLabel(row(), NOON)).toBe('next fire unknown')
    expect(nextFireLabel(row({ nextFireAt: 'soon' }), NOON)).toBe('next fire unknown')
  })
})
