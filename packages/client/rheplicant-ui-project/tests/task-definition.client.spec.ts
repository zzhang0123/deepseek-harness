import { describe, expect, it } from 'vitest'
import { taskDefinition, type DefinitionInput } from '../src/client/task-definition.ts'
import type { ProjectDefinitionBody } from '@rheplicant/dsh-rheplicant'

const TASK = { path: 'tasks/fit.yaml', bytes: 120, modifiedAt: '', executionCount: 0 }

/** A report in which every criterion is met, to be spoiled one at a time. */
function defined(over: Partial<ProjectDefinitionBody> = {}): ProjectDefinitionBody {
  return {
    path: 'tasks/fit.yaml',
    digest: 'abc',
    inputs: [{
      where: 'model.gain.gain', path: 'inputs/gain.npy', format: 'npy',
      resolves: true, inProject: true, projectPath: 'inputs/gain.npy',
    }],
    validation: { valid: true, errors: [], warnings: [] },
    gates: { checks: [{ check: 'linearity', mode: 'warn', state: 'warn', reason: null }], runs: [], warnings: [] },
    fields: { undecided: [] },
    ...over,
  }
}

function input(over: Partial<DefinitionInput> = {}): DefinitionInput {
  return {
    task: TASK,
    report: defined(),
    problem: undefined,
    documentDigest: 'abc',
    ...over,
  } as DefinitionInput
}

/** One criterion by id, so a test never depends on ordering. */
function criterion(state: DefinitionInput, id: string) {
  const found = taskDefinition(state).find(row => row.id === id)
  if (found === undefined) throw new Error(`no criterion ${id}`)
  return found
}

describe('the four criteria of §7', () => {
  it('reports all four, in reading order', () => {
    expect(taskDefinition(input()).map(row => row.id))
      .toEqual(['inputs', 'document', 'gates', 'name'])
  })

  it('is met when every criterion is', () => {
    expect(taskDefinition(input()).every(row => row.state === 'ok')).toBe(true)
  })
})

describe('criterion 1 — inputs resolve', () => {
  it('is unmet when a reference does not resolve', () => {
    const report = defined({
      inputs: [{
        where: 'model.gain.gain', path: 'inputs/gain.npy', format: 'npy',
        resolves: false, inProject: false,
      }],
    })
    expect(criterion(input({ report }), 'inputs').state).toBe('unmet')
  })

  it('is met, not unknown, when the document references no files at all', () => {
    // Vacuously satisfied is a real answer. Rendering it as "we do not know"
    // would leave a perfectly defined task looking unfinished forever.
    const row = criterion(input({ report: defined({ inputs: [] }) }), 'inputs')
    expect(row.state).toBe('ok')
    expect(row.detail).toContain('no file')
  })

  it('does not call a reference unresolved when it resolved OUTSIDE the project', () => {
    // rheplicant applies no containment on purpose (§12.1). A `~/data/...`
    // reference that resolves is a met criterion, not a failure.
    const report = defined({
      inputs: [{
        where: 'model.gain.gain', path: '~/data/beam.npy', format: 'npy',
        resolves: true, inProject: false,
      }],
    })
    expect(criterion(input({ report }), 'inputs').state).toBe('ok')
  })

  it('is unmet for a malformed reference', () => {
    const report = defined({
      inputs: [{
        where: 'model.gain.gain', path: '17', format: 'npy',
        resolves: false, inProject: false, malformed: true,
      }],
    })
    expect(criterion(input({ report }), 'inputs').state).toBe('unmet')
  })
})

describe('criterion 2 — the document validates', () => {
  it('is unmet when preflight refused', () => {
    const report = defined({
      validation: { valid: false, errors: [{ path: 'model', code: 'C1', message: 'no' }], warnings: [] },
    })
    expect(criterion(input({ report }), 'document').state).toBe('unmet')
  })

  it('stays met when preflight only warned', () => {
    const report = defined({
      validation: { valid: true, errors: [], warnings: [{ path: 'model', code: 'C2', message: 'hm' }] },
    })
    const row = criterion(input({ report }), 'document')
    expect(row.state).toBe('ok')
    expect(row.detail).toContain('1 warning')
  })
})

describe('criterion 3 — the gates are priced', () => {
  it('is unmet when a skip carries no written reason', () => {
    const report = defined({
      gates: { checks: [{ check: 'linearity', mode: 'skip', state: 'skip', reason: null }], runs: [], warnings: [] },
    })
    const row = criterion(input({ report }), 'gates')
    expect(row.state).toBe('unmet')
    expect(row.detail).toContain('linearity')
  })

  it('is met when a skip carries one', () => {
    const report = defined({
      gates: {
        checks: [{ check: 'linearity', mode: 'skip', state: 'skip', reason: 'linear by construction' }],
        runs: [], warnings: [],
      },
    })
    expect(criterion(input({ report }), 'gates').state).toBe('ok')
  })

  it('names every check and its mode, because "priced" means somebody SAW them', () => {
    // Preflight already REFUSES a reasonless skip (rheplicant's check A37), so
    // enforcing the reason is not this criterion's contribution. The other
    // half of §7's wording is — "the user has seen what the checks cost and
    // chosen modes" — and nothing can assert that a human looked except a
    // panel that puts the table where they are looking.
    const report = defined({
      gates: {
        checks: [
          { check: 'linearity', mode: 'skip', state: 'skip', reason: 'linear by construction' },
          { check: 'identifiability', mode: 'warn', state: 'off', reason: null },
        ],
        runs: [], warnings: [],
      },
    })
    const row = criterion(input({ report }), 'gates')
    expect(row.state).toBe('ok')
    expect(row.detail).toContain('linearity skip')
    expect(row.detail).toContain('identifiability off')
  })

  it('does not demand a reason for a check that is OFF', () => {
    // The type says why: "A skip needs a reason because somebody chose it; an
    // off does not." Nobody asked for an off check, so there is no decision
    // to justify.
    const report = defined({
      gates: { checks: [{ check: 'linearity', mode: 'warn', state: 'off', reason: null }], runs: [], warnings: [] },
    })
    expect(criterion(input({ report }), 'gates').state).toBe('ok')
  })
})

describe('criterion 4 — the task is named', () => {
  it('is met for any task the project listed, and names where results land', () => {
    const row = criterion(input(), 'name')
    expect(row.state).toBe('ok')
    expect(row.detail).toContain('results/tasks/fit')
  })
})

describe('what cannot be answered', () => {
  it('is unknown, never unmet, while the check is still running', () => {
    const rows = taskDefinition(input({ report: undefined, problem: 'loading' }))
    expect(rows.filter(row => row.id !== 'name').every(row => row.state === 'unknown')).toBe(true)
  })

  it('is unknown, never unmet, when the check could not be reached', () => {
    const rows = taskDefinition(input({ report: undefined, problem: 'unreachable' }))
    expect(rows.filter(row => row.id !== 'name').every(row => row.state === 'unknown')).toBe(true)
  })

  it('still names the task when nothing else can be checked', () => {
    // Criterion 4 is answered by the LISTING, not by the compute service, so
    // an unreachable service must not take it down with the other three.
    expect(criterion(input({ report: undefined, problem: 'unreachable' }), 'name').state).toBe('ok')
  })
})

describe('a verdict about a different version of the document', () => {
  it('is not presented as a verdict about this one', () => {
    // The document pane and this check are two separate fetches (§12.6).
    const rows = taskDefinition(input({ documentDigest: 'a-different-hash' }))
    expect(rows.filter(row => row.id !== 'name').every(row => row.state === 'unknown')).toBe(true)
    expect(rows[0]?.detail).toContain('changed')
  })

  it('is trusted when the digest could not be computed at all', () => {
    // Three values, not two: `crypto.subtle` is absent outside a secure
    // context, and treating "could not compare" as "changed" would make every
    // check unusable on a plain-http deployment.
    expect(criterion(input({ documentDigest: undefined }), 'inputs').state).toBe('ok')
  })
})

describe('the required fields still undecided', () => {
  /** One undecided field, as the grammar describes it. */
  function undecided(path: string, label: string, section = 'runs') {
    return { path, label, section, widget: 'value', choices: [], units: [] }
  }

  it('names them instead of only saying the document is not valid', () => {
    // A verdict tells you there is a problem; a list tells you what to do
    // about it. `must_decide` is upstream's own flag, so the names are the
    // grammar's rather than ours.
    const report = defined({
      validation: { valid: false, errors: [{ path: 'runs[0]', code: 'A1', message: 'incomplete' }], warnings: [] },
      fields: { undecided: [
        undecided('runs[0].num_samples', 'num samples'),
        undecided('runs[0].num_warmup', 'num warmup'),
      ] },
    })
    const row = criterion(input({ report }), 'document')
    expect(row.state).toBe('unmet')
    expect(row.detail).toContain('runs[0].num_samples')
    expect(row.detail).toContain('runs[0].num_warmup')
  })

  it('is unmet on undecided fields even when pre-flight did not refuse', () => {
    // The two are different questions. Pre-flight refuses what it can decide
    // from the text; a required field with no value is not always a refusal,
    // and a task with one is still not defined.
    const report = defined({
      validation: { valid: true, errors: [], warnings: [] },
      fields: { undecided: [undecided('observation.freq.grid', 'grid', 'observation')] },
    })
    const row = criterion(input({ report }), 'document')
    expect(row.state).toBe('unmet')
    expect(row.detail).toContain('observation.freq.grid')
  })

  it('says pre-flight is clean when nothing is undecided', () => {
    expect(criterion(input(), 'document').detail).toContain('pre-flight clean')
  })

  it('does not claim completeness when the fields could not be named', () => {
    // `rheplicant.gui` is optional. Absent, we know pre-flight passed and we
    // do NOT know whether a required field is unset — so the criterion says
    // so rather than reporting a clean document.
    const report = defined({ validation: { valid: true, errors: [], warnings: [] }, fields: null })
    const row = criterion(input({ report }), 'document')
    expect(row.state).toBe('ok')
    expect(row.detail).toContain('could not be checked')
  })

  it('caps a long list rather than pasting fifty paths into one line', () => {
    const many = Array.from({ length: 12 }, (_, i) => undecided(`runs[0].k${i}`, `k${i}`))
    const row = criterion(input({ report: defined({ fields: { undecided: many } }) }), 'document')
    expect(row.detail).toContain('12 required fields unset')
    // Names the first few and SAYS how many it did not name. A cap that stays
    // quiet renders as a complete list that happens to be short.
    expect(row.detail).toContain('runs[0].k0')
    expect(row.detail).toContain('+9 more')
    expect(row.detail).not.toContain('runs[0].k11')
    expect(row.detail.length).toBeLessThan(200)
  })
})
