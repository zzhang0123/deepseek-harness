/**
 * Run one task FILE and publish it — the sequence, without a conversation.
 *
 * `docs/superpowers/specs/2026-08-26-trigger-registry-design.md` §1. This
 * sequence lived inside `rheplicant_run`'s `execute`, where it read the
 * workspace off `exec.agent.session.header.cwd`. Every OTHER use of the agent
 * there was already optional — `sessionId`, the job owner, the durable event
 * are all facts about a conversation, and a run with no conversation
 * legitimately has none of them (`project-model.md` §11 removed session as an
 * addressing dimension). The workspace was the exception, and only because
 * that is where a chat-driven run happens to find it: it is the PROJECT the run
 * belongs to, not a fact about the chat.
 *
 * So the workspace is an argument here. Nothing else about the sequence
 * changes, and that is the point — one publisher, one definition of what an
 * execution is. A second caller that assembled its own tree would be a second
 * answer to "what is an execution", which every surface in `project-model.md`
 * §§23–26 reads as one.
 *
 * What deliberately stays in the tool: the inline-document form (scratch work
 * has no file and so no place in `results/`), background jobs, the durable
 * `rheplicant/run` event, and the model-facing formatting. All four are about
 * the conversation.
 *
 * **UNCONVERGED, AND RECORDED SO IT CANNOT DRIFT SILENTLY.** `rheplicant_run`
 * still runs this sequence INLINE rather than calling this function, so the
 * publish sequence exists twice right now. The two are identical today and
 * this one has no production caller yet, so nothing is broken — but two copies
 * of "what an execution is" is exactly the drift this repo builds gates
 * against, and a comment is the weakest available guard.
 *
 * The one obstacle to converging is already removed: the tool's background form
 * returns `{ jobId, executionId }` before dispatch, so it must mint the id
 * first — hence {@link PublishRequest.executionId}. What remains is the
 * refactor itself, and it is deferred for a reason worth stating: the tool's
 * `execute` has NO unit coverage of this sequence. Its guards are
 * `integration-tests/emit.spec.ts` and `assembled.spec.ts`, which must be
 * copied into a dsh checkout and spawn a real Python compute service. Changing
 * that path in the same commit that introduced its replacement would be
 * shipping a regression nobody could see.
 *
 * **The convergence, when it is done:** route the tool's `task:` branch through
 * here with its pre-minted id, leave the `document:` branch alone, and verify
 * with those two integration specs actually running — not with the typechecker.
 *
 * @module @rheplicant/dsh-rheplicant/publish
 */

import { ensureResultsIgnored, executionDirectory, taskSegment, writeSidecar } from './project.ts'
import { mintExecutionId, readTaskFile } from './task.ts'
import type { ComputeRuntime } from './index.ts'
import type { RunOutcome, Transport } from './types.ts'

/** One request to run a task file and publish the result. */
export interface PublishRequest {
  /**
   * The project directory. EXPLICIT — see the module note. A caller that has a
   * session passes its cwd; a caller that has a trigger passes the project the
   * trigger names.
   */
  readonly workspace: string
  /** The task document's path, resolved against {@link workspace}. */
  readonly task: string
  readonly transport: Transport
  /** Which runs to execute; absent runs every one the document declares. */
  readonly runs?: readonly string[] | undefined
  /** Provenance only, and absent for a run no conversation caused. */
  readonly sessionId?: string | undefined
  readonly signal?: AbortSignal | undefined
  /**
   * A pre-minted execution id, when the caller has already promised one.
   *
   * `rheplicant_run`'s background form returns `{ jobId, executionId }` the
   * moment the job starts, so it must mint before dispatch. Without this
   * argument that contract and this function could not both hold, and the tool
   * would have to keep its own copy of the publish sequence — a second answer
   * to "what is an execution", which every surface in §§23–26 reads as one.
   */
  readonly executionId?: string | undefined
}

/** What a published run leaves behind. */
export interface PublishedRun {
  readonly executionId: string
  readonly outcome: RunOutcome
  /** Where the tree landed, absent when the run could not publish. */
  readonly publishedTo: string | undefined
  /** The `.gitignore` this run created, announced once (§9.1). */
  readonly ignoreWritten: string | undefined
}

/**
 * Run a task file and publish its tree.
 *
 * @param rheplicant - the compute seam.
 * @param request - what to run, and in which project.
 * @returns the execution's identity and outcome.
 * @throws ComputeError when the task file cannot be read under confinement.
 */
export async function publishTaskRun(
  rheplicant: ComputeRuntime,
  request: PublishRequest,
): Promise<PublishedRun> {
  // Read under confinement to the PROJECT rather than to a session directory.
  // Same function, same refusals; only the root differs, and the project is the
  // more honest root — it is what the results belong to either way.
  const file = readTaskFile(request.task, request.workspace, 'rheplicant publish')
  // `file.root`, never `request.workspace`. They name the same directory and
  // may SPELL it differently — a caller holding `/var/folders/…` against a
  // canonical `/private/var/folders/…` puts two spellings into one `relative()`
  // and the execution directory comes out as a `../` chain that leaves the
  // project. `readTaskFile` canonicalises once, for its confinement check, and
  // hands the result back so nothing recomputes it.
  const workspace = file.root
  const executionId = request.executionId ?? mintExecutionId(file.digest)
  const publishTo = executionDirectory(workspace, file.resolvedPath, executionId)
  // Before the first tree lands, not after it (§9.1).
  const ignoreWritten = ensureResultsIgnored(workspace)
  const startedAt = new Date().toISOString()

  const outcome = await rheplicant.run(
    { documentText: file.text, taskPath: file.resolvedPath },
    {
      transport: request.transport,
      ...(request.runs === undefined ? {} : { runs: request.runs }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      outputsDir: publishTo,
    },
  )

  // The tree that EXISTS, which for a refused or errored run is a sibling of
  // the directory that was asked for.
  const resultsPath = outcome.resultsPath ?? publishTo
  writeSidecar(resultsPath, {
    executionId,
    task: taskSegment(workspace, file.resolvedPath),
    taskPath: file.resolvedPath,
    taskDigest: file.digest,
    transport: request.transport,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    // Off the OUTCOME, not off the document: a run that refused partway
    // published fewer entries than the document declared, and the sidecar
    // describes what happened.
    ...(outcome.runs.length === 0 ? {} : { kinds: outcome.runs.map(entry => entry.kind) }),
  })

  return { executionId, outcome, publishedTo: resultsPath, ignoreWritten }
}
