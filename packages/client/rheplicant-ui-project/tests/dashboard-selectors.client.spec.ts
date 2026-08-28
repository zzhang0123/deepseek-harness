import { describe, expect, it } from 'vitest'
import {
  allExecutions, allTasks, allTriggers, kindsPresent, matchesKind, neverRun,
  nextFireLabel, orphanTriggers, outcomeParts, projectTotals, routineTriggers,
  scheduleBoard, sinceLabel, triggersForTask, unreadableRegistries,
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
  return { name: 'nightly', action: 'run', task: 'tasks/demo.yaml', cadence: 'P1D', cadenceKind: 'every', enabled: true, ...over }
}

/** One ROUTINE row — a prompt on a cadence, naming no task at all. */
function routine(
  over: { [K in keyof ProjectTriggerRow]?: ProjectTriggerRow[K] | undefined } = {},
): ProjectTriggerRow {
  const base: ProjectTriggerRow = {
    name: 'brief', action: 'routine', prompt: 'Check the overnight fits',
    cadence: 'PT30M', cadenceKind: 'every', enabled: true,
  }
  // An override of `undefined` REMOVES the field rather than setting it to
  // `undefined` — which is what a test saying `{ lastFiredAt: undefined }`
  // means, and what `exactOptionalPropertyTypes` will not let it say directly.
  const merged = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged as unknown as ProjectTriggerRow
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
    const [only] = allTriggers([card({ scheduled: [trigger({ name: 'ten', cadence: 'PT10M' })] })])
    expect(only?.name).toBe('ten')
    expect(only?.cadence).toBe('PT10M')
    expect(only?.cadenceKind).toBe('every')
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
      scheduled: [trigger({ name: 'a' }), trigger({ name: 'b', cadence: 'PT10M' })],
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

describe('routines, which belong to the project rather than to a task', () => {
  it('gets NO taskPresence, because it names no task to have one about', () => {
    // `unknown` is a real claim — *cannot tell if this task is here*. Making it
    // carry "there is no task to look for" would put two facts under one word.
    const [row] = allTriggers([card({ scheduled: [routine()] })])
    expect(row?.taskPresence).toBeUndefined()
  })

  it('is NEVER an orphan, whose heading would be a false statement about it', () => {
    // `orphanTriggers` means "names a task that is not here". A routine names
    // nothing, so that is not a weaker claim about it — it is a wrong one.
    const triggers = allTriggers([card({ scheduled: [routine()] })])
    expect(orphanTriggers(triggers)).toEqual([])
  })

  it('never attaches to a task row, even one whose path it could be confused with', () => {
    const triggers = allTriggers([card({ scheduled: [routine()] })])
    expect(triggersForTask(triggers, task())).toEqual([])
  })

  it('is listed on its own, carrying the prompt it will say', () => {
    const triggers = allTriggers([card({ scheduled: [routine()] })])
    expect(routineTriggers(triggers).map(row => row.prompt)).toEqual(['Check the overnight fits'])
  })

  it('leaves task triggers where they were — both kinds from one registry', () => {
    const triggers = allTriggers([card({ scheduled: [trigger(), routine()] })])
    expect(routineTriggers(triggers).map(row => row.name)).toEqual(['brief'])
    expect(triggersForTask(triggers, task()).map(row => row.name)).toEqual(['nightly'])
  })

  it('still answers when it is next due, by the same clock as everything else', () => {
    const triggers = allTriggers([card({ scheduled: [routine({ lastFiredAt: undefined })] })])
    expect(nextFireLabel(triggers[0]!, Date.parse('2026-08-27T06:00:00Z'))).toBeTruthy()
  })
})

describe('the board, which orders by WHEN rather than by project', () => {
  /** A row with only its ordering inputs stated. */
  function row(name: string, nextFireAt?: string): DashboardTrigger {
    return {
      name, action: 'run', task: 't.yaml', cadence: 'P1D', cadenceKind: 'every', enabled: nextFireAt !== undefined,
      workspaceId: 'ws-1', project: 'alpha', taskPresence: 'present',
      ...(nextFireAt === undefined ? {} : { nextFireAt }),
    }
  }

  it('puts the soonest fire first, across projects', () => {
    const board = scheduleBoard([
      row('later', '2026-08-28T12:00:00.000Z'),
      row('sooner', '2026-08-28T06:00:00.000Z'),
    ])
    expect(board.map(entry => entry.name)).toEqual(['sooner', 'later'])
  })

  it('leaves an OVERDUE instant in the past, so it sorts to the very front', () => {
    // §27.2: `next fire` is not clamped to now. A harness that was down across
    // a window leaves an instant behind it, and that is the evidence for the
    // "only while this harness is running" sentence — moving it forward would
    // erase exactly what the board is for.
    const board = scheduleBoard([
      row('soon', '2026-08-28T06:00:00.000Z'),
      row('overdue', '2020-01-01T00:00:00.000Z'),
    ])
    expect(board[0]?.name).toBe('overdue')
  })

  it('sinks a disabled row without dropping it', () => {
    // Hiding it would answer "what is scheduled" with a subset — and the
    // board's one control is the switch that turns it back on, so an invisible
    // row would be unreachable.
    const board = scheduleBoard([row('off'), row('on', '2026-08-28T06:00:00.000Z')])
    expect(board.map(entry => entry.name)).toEqual(['on', 'off'])
    expect(board).toHaveLength(2)
  })

  it('sinks a timestamp it cannot parse, rather than sorting it as zero', () => {
    // `Date.parse` answers NaN, and NaN in a comparator scrambles the whole
    // list rather than misplacing one row.
    const board = scheduleBoard([row('bad', 'tomorrow'), row('good', '2026-08-28T06:00:00.000Z')])
    expect(board.map(entry => entry.name)).toEqual(['good', 'bad'])
  })

  it('keeps registry order among ties, so the board does not shuffle under the pointer', () => {
    const same = '2026-08-28T06:00:00.000Z'
    const board = scheduleBoard([row('a', same), row('b', same), row('c', same)])
    expect(board.map(entry => entry.name)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate what it was handed', () => {
    const given = [row('later', '2026-08-28T12:00:00.000Z'), row('sooner', '2026-08-28T06:00:00.000Z')]
    scheduleBoard(given)
    expect(given.map(entry => entry.name)).toEqual(['later', 'sooner'])
  })
})

describe('a wall-clock trigger on the board', () => {
  it('keeps its kind through the selectors, so a renderer can tell them apart', () => {
    const dawn = trigger({ name: 'dawn', cadence: '08:00', cadenceKind: 'dailyAt' })
    const [only] = allTriggers([card({ scheduled: [dawn] })])
    expect(only).toMatchObject({ cadence: '08:00', cadenceKind: 'dailyAt' })
  })

  it('sorts by next fire beside an interval trigger, since WHEN is one question', () => {
    const soon = { ...trigger({ name: 'soon' }), workspaceId: 'ws-1', project: 'a', taskPresence: 'present', nextFireAt: '2026-08-28T06:00:00.000Z' } as DashboardTrigger
    const later = { ...trigger({ name: 'later', cadence: '23:00', cadenceKind: 'dailyAt' }), workspaceId: 'ws-1', project: 'a', taskPresence: 'present', nextFireAt: '2026-08-28T21:00:00.000Z' } as DashboardTrigger
    expect(scheduleBoard([later, soon]).map(row => row.name)).toEqual(['soon', 'later'])
  })
})


describe('how a project\u2019s executions ended', () => {
  it('names every outcome that happened, in the order the tree names them', () => {
    expect(outcomeParts(projectTotals(card({
      executions: [
        execution({ executionId: 'E1', status: 'error' }),
        execution({ executionId: 'E2', status: 'ok' }),
        execution({ executionId: 'E3', status: 'refused' }),
        execution({ executionId: 'E4', status: 'ok' }),
      ],
    })))).toEqual([
      { status: 'ok', count: 2 },
      { status: 'refused', count: 1 },
      { status: 'error', count: 1 },
    ])
  })

  it('drops the outcomes that did not happen rather than printing zeroes', () => {
    expect(outcomeParts(projectTotals(card({
      executions: [execution({ status: 'ok' }), execution({ executionId: 'E2', status: 'ok' })],
    })))).toEqual([{ status: 'ok', count: 2 }])
  })

  it('sums to the execution count, which is what makes it a breakdown', () => {
    // Guaranteed rather than hoped: `isExecution` refuses a row whose status
    // is not one of the three, and refuses the whole answer with it.
    const project = projectTotals(card({
      executions: [
        execution({ executionId: 'E1', status: 'ok' }),
        execution({ executionId: 'E2', status: 'refused' }),
        execution({ executionId: 'E3', status: 'error' }),
      ],
    }))
    const summed = outcomeParts(project).reduce((total, part) => total + part.count, 0)
    expect(summed).toBe(project.executions)
  })

  it('says nothing for a project that has not run anything', () => {
    expect(outcomeParts(projectTotals(card({ executions: [] })))).toEqual([])
  })

  it('says nothing for a project that could not be read, rather than three dashes', () => {
    expect(outcomeParts(projectTotals({ workspaceId: 'ws-1', title: 'a', overview: undefined } as never)))
      .toEqual([])
  })
})

describe('how long ago an instant was', () => {
  const NOW = Date.parse('2026-08-26T12:00:00.000Z')
  /** `NOW` minus a span, as the ISO string a row would carry. */
  const ago = (ms: number) => new Date(NOW - ms).toISOString()

  it('walks the ladder', () => {
    expect(sinceLabel(ago(30_000), NOW)).toBe('just now')
    expect(sinceLabel(ago(8 * 60_000), NOW)).toBe('8 min ago')
    expect(sinceLabel(ago(3 * 3_600_000), NOW)).toBe('3 h ago')
    expect(sinceLabel(ago(3 * 86_400_000), NOW)).toBe('3 d ago')
  })

  // The dispatch thresholds themselves, and one tick either side of each. A
  // ladder is a dispatcher, and its bugs live exactly here: the version this
  // replaced chose the bucket from the raw span and then rounded separately,
  // which printed `60 min ago` for the last second of the hour.
  it.each([
    [60_000 - 1, 'just now'],
    [60_000, '1 min ago'],
    [90_000, '2 min ago'],
    [3_600_000 - 1, '1 h ago'],
    [3_600_000, '1 h ago'],
    [3_570_000, '1 h ago'],
    [3_569_999, '59 min ago'],
    [86_400_000 - 1, '1 d ago'],
    [86_400_000, '1 d ago'],
    [86_400_000 - 1_800_000, '1 d ago'],
    [86_400_000 - 1_800_001, '23 h ago'],
  ])('says %i ms ago is "%s"', (span, phrase) => {
    expect(sinceLabel(ago(span), NOW)).toBe(phrase)
  })

  it('treats a minute of clock skew as now, and more than that as wrong', () => {
    // A file mtime a few seconds ahead of the reader is ordinary on a shared
    // or virtualised filesystem. A day ahead is not, and `just now` would
    // hide it.
    expect(sinceLabel(ago(-30_000), NOW)).toBe('just now')
    expect(sinceLabel(ago(-60_000), NOW)).toBe('just now')
    expect(sinceLabel(ago(-60_001), NOW)).toBe('in the future')
    expect(sinceLabel(ago(-86_400_000), NOW)).toBe('in the future')
  })

  it('answers unknown for both ways of not having an instant', () => {
    expect(sinceLabel(undefined, NOW)).toBe('unknown')
    expect(sinceLabel('x', NOW)).toBe('unknown')
    expect(sinceLabel('', NOW)).toBe('unknown')
  })
})

describe('the next-fire ladder picks the unit it has a name for', () => {
  const NOON = Date.parse('2026-08-26T12:00:00.000Z')
  const row = (over: Partial<DashboardTrigger> = {}): DashboardTrigger => ({
    workspaceId: 'ws-1', project: 'alpha', name: 'n', task: 'tasks/demo',
    cadence: 'PT10M', cadenceKind: 'every', enabled: true, ...over,
  } as DashboardTrigger)

  it('crosses into hours and days at the printed number, not the raw span', () => {
    expect(nextFireLabel(row({ nextFireAt: new Date(NOON + 3_600_000 - 1).toISOString() }), NOON))
      .toBe('in 1 h')
    expect(nextFireLabel(row({ nextFireAt: new Date(NOON + 86_400_000 - 1).toISOString() }), NOON))
      .toBe('in 1 d')
    // And still reports the unit below when it genuinely belongs there.
    expect(nextFireLabel(row({ nextFireAt: new Date(NOON + 3_569_999).toISOString() }), NOON))
      .toBe('in 59 min')
  })
})
