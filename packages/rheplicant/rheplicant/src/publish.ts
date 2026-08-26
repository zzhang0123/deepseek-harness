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
 * **CONVERGED 2026-08-26.** `rheplicant_run`'s `task:` branch — foreground and
 * background alike — calls this function, so there is now exactly one publish
 * sequence and one definition of what an execution is. The `document:` branch
 * is untouched and still publishes nothing, which is the point: an inline run
 * has no file, so it has no place in `results/`.
 *
 * Two things the convergence needed, and both are visible in the request type.
 * {@link PublishRequest.executionId} exists because the background form returns
 * `{ jobId, executionId }` before dispatch and must therefore mint first;
 * {@link PublishRequest.file} exists because that same caller has already READ
 * the document to compute the digest the id is minted from, and reading it
 * again would let the bytes change underneath a digest that claims to describe
 * them.
 *
 * The convergence was deferred once for a stated reason — that the tool's path
 * had no unit coverage — and the reason named the wrong guard. Measured
 * 2026-08-26: `integration-tests/{emit,assembled}.spec.ts` both drive the
 * INLINE branch, so they never covered this sequence at all. The coverage now
 * exists as `tool-run/tests/publish-path.spec.ts`, and writing it first found a
 * live defect the convergence fixes.
 *
 * @module @rheplicant/dsh-rheplicant/publish
 */

import { ensureResultsIgnored, executionDirectory, taskSegment, writeSidecar } from './project.ts'
import { mintExecutionId, readTaskFile } from './task.ts'
import type { TaskFile } from './task.ts'
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
  /**
   * The task file already read, when the caller has one.
   *
   * Given, this function does NOT read the document again — and that is a
   * correctness requirement, not an optimisation. A caller that has already
   * minted an execution id from the document's digest has committed to those
   * exact bytes; reading a second time leaves a window in which the file
   * changes, and the digest recorded on the execution would then describe bytes
   * that did not run. That is the one thing `taskDigest` exists to make
   * impossible (§4.2).
   *
   * `resolveTaskInput` hands this back for exactly this purpose.
   */
  readonly file?: TaskFile | undefined
  /**
   * The name a refusal should give as its own caller, e.g. `rheplicant_run`.
   *
   * Model-facing text: a tool routing through here must still say its own name,
   * or the person reading the transcript is told a function they never called
   * refused them. Defaults to `rheplicant publish`, which is what a trigger fire
   * — having no tool above it — should say.
   */
  readonly label?: string | undefined
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
  // more honest root — it is what the results belong to either way. A caller
  // that already read it passes it in, so the bytes are read exactly once —
  // see {@link PublishRequest.file}.
  const file = request.file ?? readTaskFile(request.task, request.workspace, request.label ?? 'rheplicant publish')
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

  // The tree that EXISTS, which for a partially-refused run is a sibling of
  // the directory that was asked for.
  //
  // A DOCUMENT-LEVEL REFUSAL NEVER REACHES THIS LINE, and that is worth stating
  // because the naming suggests otherwise. Measured 2026-08-26 against a live
  // service: rheplicant declining an unsound document answers with an ERROR
  // over the transport, so `rheplicant.run` above rejects and this function
  // rejects with it. The tree is still published — upstream renames it with a
  // `.refused-<hash>` suffix, which is exactly where `listExecutions` reads the
  // status from — so such an execution appears on every reading surface. What
  // it does NOT get is this sidecar, because there is no outcome to write one
  // from, so it lists with its status and without `taskDigest`, `sessionId` or
  // `kinds`. Recovering those would mean guessing which sibling directory the
  // service chose, and guessing is what this layer refuses to do.
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
