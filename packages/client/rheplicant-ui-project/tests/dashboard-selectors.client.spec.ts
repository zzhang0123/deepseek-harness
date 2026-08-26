import { describe, expect, it } from 'vitest'
import {
  allExecutions, kindsPresent, matchesKind, projectTotals,
  type DashboardExecution,
} from '../src/client/dashboard-selectors.ts'
import type { ProjectCard } from '../src/client/use-all-projects.ts'

/** One execution row, with only what a given assertion needs stated. */
function execution(over: Partial<DashboardExecution> = {}): DashboardExecution {
  return {
    executionId: 'E1', task: 'tasks/demo', status: 'ok', path: 'results/tasks/demo/E1/',
    workspaceId: 'ws-1', project: 'alpha', ...over,
  }
}

/** One project card, readable unless `overview` is explicitly undefined. */
function card(over: Partial<ProjectCard> & { executions?: DashboardExecution[] } = {}): ProjectCard {
  const { executions, ...rest } = over
  return {
    workspaceId: 'ws-1',
    title: 'alpha',
    overview: {
      project: 'alpha', tasks: [], inputs: [], truncated: false,
      executions: executions ?? [],
    },
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
