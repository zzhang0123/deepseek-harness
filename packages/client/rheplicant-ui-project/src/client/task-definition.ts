/**
 * How far one TASK is from being DEFINED — read off the document as authored,
 * not off the project tree.
 *
 * `docs/project-model.md` §7 and §12. The companion to `task-maturity.ts`,
 * and deliberately not part of it: maturity answers *should I believe these
 * results* from evidence on disk, and every criterion here is a pure function
 * of the document's own text, which leaves nothing on disk at all. Folding
 * them together would re-create exactly the stage P7c deleted — one whose
 * evidence never reaches the tree, so it reads as "never validated" rather
 * than "not recorded here".
 *
 * **Three states, not two.** `unknown` means the check could not be run, and
 * it must never render as `unmet`: telling someone their document is wrong
 * when the truth is that nobody could ask is how a fine document gets edited.
 * The same discipline the stale flag has for the same reason.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/task-definition
 */

import type {
  CheckCost, ProjectDefinitionBody, ProjectTaskRow, UndecidedField,
} from '@rheplicant/dsh-rheplicant'

/** How a criterion reads. */
export type DefinitionState = 'ok' | 'unmet' | 'unknown'

/** One of §7's four criteria. */
export interface DefinitionCriterion {
  readonly id: 'inputs' | 'document' | 'gates' | 'name'
  readonly label: string
  readonly state: DefinitionState
  readonly detail: string
}

/** Why a check could not be made, when it could not. */
export type DefinitionProblem = 'loading' | 'unreachable' | 'refused'

/** Everything the checklist is derived from. */
export interface DefinitionInput {
  readonly task: ProjectTaskRow
  /** The host's answer, absent while loading or when it could not be had. */
  readonly report: ProjectDefinitionBody | undefined
  readonly problem: DefinitionProblem | undefined
  /**
   * sha256 of the document currently ON SCREEN, or undefined when it could
   * not be hashed. Compared against {@link ProjectDefinitionBody.digest}.
   */
  readonly documentDigest: string | undefined
}

/** Why the three document criteria cannot be stated, or undefined when they can. */
function unanswerable(input: DefinitionInput): string | undefined {
  if (input.problem === 'loading') return 'checking…'
  if (input.problem === 'refused') return 'this project would not serve that document'
  if (input.report === undefined) return 'this task could not be checked from here'
  // Absent must never read as "changed": `crypto.subtle` exists only in a
  // secure context, and a plain-http deployment would otherwise show every
  // task as unverifiable forever.
  if (input.documentDigest !== undefined && input.documentDigest !== input.report.digest) {
    return 'the document changed since this check — refresh to check it again'
  }
  return undefined
}

/**
 * §7's four criteria for one task.
 *
 * @param input - the task, the host's answer, and the on-screen document's digest.
 * @returns the four criteria, in reading order.
 */
export function taskDefinition(input: DefinitionInput): readonly DefinitionCriterion[] {
  const blocked = unanswerable(input)
  // Criterion 4 is answered by the LISTING, so an unreachable compute service
  // must not take it down with the other three.
  const named = nameCriterion(input.task)
  if (blocked !== undefined || input.report === undefined) {
    const detail = blocked ?? 'this task could not be checked from here'
    return [
      { id: 'inputs', label: 'Inputs resolve', state: 'unknown', detail },
      { id: 'document', label: 'Document validates', state: 'unknown', detail },
      { id: 'gates', label: 'Gates priced', state: 'unknown', detail },
      named,
    ]
  }
  return [
    inputsCriterion(input.report),
    documentCriterion(input.report),
    gatesCriterion(input.report),
    named,
  ]
}

/** Criterion 1: every `file:` reference resolves. */
function inputsCriterion(report: ProjectDefinitionBody): DefinitionCriterion {
  const total = report.inputs.length
  // Vacuously satisfied is a real answer. A document that references no files
  // has nothing left to resolve, and rendering that as "unknown" would leave
  // a finished task looking unfinished forever.
  if (total === 0) {
    return {
      id: 'inputs', label: 'Inputs resolve', state: 'ok',
      detail: 'no file: references to resolve',
    }
  }
  // A reference that resolved OUTSIDE the project is resolved. §7 words this
  // criterion as "under inputs/", which is stricter than the package:
  // config/files.py applies no containment on purpose (§12.1).
  const missing = report.inputs.filter(reference => !reference.resolves)
  if (missing.length === 0) {
    return {
      id: 'inputs', label: 'Inputs resolve', state: 'ok',
      detail: `${total} reference${total === 1 ? '' : 's'}, all resolved`,
    }
  }
  const malformed = missing.filter(reference => reference.malformed === true).length
  const named = missing.map(reference => reference.path).join(', ')
  return {
    id: 'inputs',
    label: 'Inputs resolve',
    state: 'unmet',
    detail: malformed === missing.length
      ? `${malformed} malformed reference${malformed === 1 ? '' : 's'}: ${named}`
      : `${missing.length} of ${total} not found: ${named}`,
  }
}

/**
 * Criterion 2: pre-flight is clean, and no required field is still unset.
 *
 * Two questions, and the second one is what makes this criterion actionable.
 * Pre-flight refuses what it can decide from the text; a required field with
 * no value is not always a refusal, and a task carrying one is still not
 * defined. Naming the fields turns a verdict — "the document does not
 * validate" — into a to-do list.
 *
 * `fields === null` means the optional `rheplicant.gui` extra is absent, so
 * we know pre-flight passed and do NOT know whether something is unset. The
 * criterion says exactly that rather than reporting a clean document.
 */
function documentCriterion(report: ProjectDefinitionBody): DefinitionCriterion {
  const errors = report.validation.errors.length
  // `null` (the gui extra is absent) and ABSENT (an older host that never
  // carried the field) are the same answer here: we cannot say. Treating
  // absent as an empty answer would report a clean document on the strength
  // of a question nobody asked.
  const fields = report.fields ?? null
  const undecided = fields?.undecided ?? []
  if (errors > 0 || undecided.length > 0) {
    return {
      id: 'document', label: 'Document validates', state: 'unmet',
      detail: errors > 0 && undecided.length === 0
        ? `${errors} refusal${errors === 1 ? '' : 's'}: ${report.validation.errors[0]?.message ?? ''}`
        : undecidedDetail(undecided),
    }
  }
  const warnings = report.validation.warnings?.length ?? 0
  const clean = warnings === 0 ? 'pre-flight clean' : `pre-flight clean, ${warnings} warning${warnings === 1 ? '' : 's'}`
  if (fields === null) {
    return {
      id: 'document', label: 'Document validates', state: 'ok',
      detail: `${clean}; whether a required field is still unset could not be checked here`,
    }
  }
  // The exclusion is stated, never inferred from an absence. A section this
  // answer did not look at is not a section with nothing left to decide.
  const excluded = fields.excludes
  return {
    id: 'document', label: 'Document validates', state: 'ok',
    detail: excluded.length === 0
      ? clean
      : `${clean}; per-run options were not checked (${excluded.join(', ')})`,
  }
}

/** How many fields are unset, naming as many as fit on one line. */
const NAMED_FIELDS = 3

function undecidedDetail(undecided: readonly UndecidedField[]): string {
  const count = `${undecided.length} required field${undecided.length === 1 ? '' : 's'} unset`
  // Named, but capped: a task early in its life can have dozens, and pasting
  // every path into one line is how the count itself becomes unreadable.
  const named = undecided.slice(0, NAMED_FIELDS).map(field => field.path).join(', ')
  const rest = undecided.length - NAMED_FIELDS
  return rest > 0 ? `${count}: ${named}, +${rest} more` : `${count}: ${named}`
}

/**
 * Criterion 3: every check has a mode, and every SKIP has a written reason.
 *
 * A skip only — never an `off`. `CheckCost.reason` states why: "A skip needs
 * a reason because somebody chose it; an off does not." Nobody asked for an
 * off check, so there is no decision to justify, and demanding one would mark
 * every document that leaves a check off as undefined. Measured on a real
 * document: two of the three checks are `off`.
 *
 * **Enforcing the reason is not this criterion's contribution.** rheplicant's
 * own preflight already refuses a reasonless skip (check `A37`), so criterion
 * 2 catches it too. What is left, and what only a panel can supply, is the
 * other half of §7's wording — "the user has seen what the checks cost and
 * chosen modes". Nothing can assert that a human looked; putting the table
 * where they are looking is the whole of what this layer can do about it. So
 * the met case NAMES every check and its mode rather than counting them.
 */
function gatesCriterion(report: ProjectDefinitionBody): DefinitionCriterion {
  const checks = report.gates.checks
  if (checks.length === 0) {
    return { id: 'gates', label: 'Gates priced', state: 'unknown', detail: 'no gate table was returned' }
  }
  const unpriced = checks.filter(isUnpricedSkip)
  if (unpriced.length > 0) {
    return {
      id: 'gates', label: 'Gates priced', state: 'unmet',
      detail: `skipped with no written reason: ${unpriced.map(check => check.check).join(', ')}`,
    }
  }
  return {
    id: 'gates', label: 'Gates priced', state: 'ok',
    // The EFFECTIVE state per check — what actually governs. A `·` between
    // them rather than a count, because "priced" means somebody SAW the table.
    detail: checks.map(check => `${check.check} ${check.state ?? 'unknown'}`).join(' · '),
  }
}

/**
 * Whether one check is a skip nobody justified.
 *
 * Reads `state`, not `state ?? mode`: this runs against a LIVE `gates` answer,
 * where the two fields now mean different things (`mode` is what a human
 * wrote, `state` is what governs). The `??` form is a back-compat read for
 * events folded out of a session log, and using it here would let an old
 * event's spelling decide a live verdict.
 */
function isUnpricedSkip(check: CheckCost): boolean {
  if (check.state !== 'skip') return false
  const reason = check.reason
  return reason === null || reason === undefined || reason.trim() === ''
}

/**
 * Criterion 4: the task is named.
 *
 * Satisfied by anything the project listed — a task the workbench can show is
 * a task with a path. What the criterion is really FOR is the empty project,
 * which has no row for this rail to sit under; the Tasks panel carries that
 * case. Naming the results home here is what makes the criterion concrete
 * rather than a tautology.
 */
function nameCriterion(task: ProjectTaskRow): DefinitionCriterion {
  const stem = task.path.replace(/\.(ya?ml)$/i, '')
  return {
    id: 'name', label: 'Task is named', state: 'ok',
    detail: `${task.path} — results land in results/${stem}/`,
  }
}
