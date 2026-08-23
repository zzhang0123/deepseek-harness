/**
 * One conversation's rheplicant work, GROUPED BY THE TASK it was about.
 *
 * `docs/project-model.md` §19. The projection used to fold every contribution
 * to "the latest of each kind" with no task discrimination at all — its own
 * comment said so. A conversation that validated task A and then ran task B
 * therefore rendered A's Validate beside B's Run, as one coherent loop. Not
 * merely "session looks one-to-one with task": a loop FABRICATED out of
 * unrelated work, which is worse than the coupling §11 set out to remove.
 *
 * The fix is at the level the fault lives on. `taskPath` has been on every
 * durable event since P1, and the client contract discarded it for two of the
 * three kinds — so nothing downstream COULD group correctly. A loop belongs
 * to a task; this makes that structural.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/loop-tasks
 */

import type {
  LoopContribution, LoopExecutionRef, LoopGatesEntry, LoopRunEntry, LoopValidateEntry,
} from './loop-contract.ts'

/** One task's loop, as this conversation exercised it. */
export interface LoopTask {
  /**
   * The task these facts are about, or undefined for work not filed under one.
   *
   * An inline document has no path to group by, so every inline contribution
   * shares one bucket. That is the best available answer and it is honest:
   * folding it into a named task would attribute scratch work to a file that
   * never ran it.
   */
  readonly taskPath?: string
  readonly validate?: LoopValidateEntry
  readonly gates?: LoopGatesEntry
  readonly run?: LoopRunEntry
  /** This task's executions in this conversation, oldest first. */
  readonly executions: readonly LoopExecutionRef[]
  /** The greatest `seq` among this task's facts. */
  readonly latestSeq: number
}

/** The key inline work groups under; a space cannot collide with a path. */
const INLINE = ' inline'

/** One execution reference off a run contribution that carries an id. */
function executionRef(data: Extract<LoopContribution, { kind: 'run' }>): LoopExecutionRef {
  return {
    executionId: data.executionId as string,
    ...(data.outcome.resultsPath === undefined ? {} : { resultsPath: data.outcome.resultsPath }),
    ...(data.taskPath === undefined ? {} : { taskPath: data.taskPath }),
    transport: data.transport,
    // One failed run makes the execution failed: a card that says "ok" while a
    // run inside it errored is the exact wrongness this console exists to kill.
    status: data.outcome.runs.some(entry => entry.status === 'failed') ? 'failed' : 'ok',
    seq: data.seq,
  }
}

/** The mutable shape accumulated during the walk. */
interface Building {
  taskPath?: string
  validate?: LoopValidateEntry
  gates?: LoopGatesEntry
  run?: LoopRunEntry
  executions: LoopExecutionRef[]
  latestSeq: number
}

/**
 * Group one conversation's contributions by the task each was about.
 *
 * @param contributions - every matched validate/gates/run fact, any order.
 * @returns one entry per task, most recently active first, so the task the
 *   conversation is working on now leads.
 */
export function groupByTask(contributions: readonly LoopContribution[]): readonly LoopTask[] {
  const byTask = new Map<string, Building>()

  // Ascending, so "latest of each kind" WITHIN one task falls out of the walk,
  // and the executions come out oldest-first with no second sort.
  for (const data of [...contributions].sort((left, right) => left.seq - right.seq)) {
    const key = data.taskPath ?? INLINE
    let group = byTask.get(key)
    if (group === undefined) {
      group = {
        ...(data.taskPath === undefined ? {} : { taskPath: data.taskPath }),
        executions: [],
        latestSeq: -1,
      }
      byTask.set(key, group)
    }
    group.latestSeq = data.seq
    if (data.kind === 'validate') {
      group.validate = {
        report: data.report, document: data.document, transport: data.transport, seq: data.seq,
      }
    } else if (data.kind === 'gates') {
      group.gates = {
        report: data.report, document: data.document, transport: data.transport, seq: data.seq,
      }
    } else {
      group.run = {
        outcome: data.outcome, document: data.document, transport: data.transport, seq: data.seq,
      }
      // A run with no id predates execution identity and has nothing to be
      // selected BY, so it contributes to the loop but not to the list.
      if (data.executionId !== undefined) group.executions.push(executionRef(data))
    }
  }

  return [...byTask.values()].sort((left, right) => right.latestSeq - left.latestSeq)
}

/**
 * The one task a conversation touched, or undefined when it is not one.
 *
 * For a LOG FALLBACK. A conversation that touched several tasks has several
 * loops, and the log cannot say which one a panel is showing — so a caller
 * that would otherwise guess declines instead. The same rule `runsToRender`
 * applies to an execution it cannot read: an answer about the wrong task is
 * worse than no answer.
 *
 * @param snapshot - the loop projection, absent outside a rheplicant session.
 * @returns the sole task, or undefined when there are none or several.
 */
export function soleTask(
  snapshot: { readonly tasks: readonly LoopTask[] } | undefined,
): LoopTask | undefined {
  return snapshot?.tasks.length === 1 ? snapshot.tasks[0] : undefined
}
