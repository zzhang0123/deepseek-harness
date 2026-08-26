/**
 * The project's on-disk layout: where an execution publishes, and the two
 * files this layer owns there.
 *
 * `docs/project-model.md` §5 and §5.1. The workspace directory IS the project,
 * and the tree under `results/` is the record — so listing a project's
 * executions is a directory read, and nothing here keeps a second ledger that
 * could drift from it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Delimits the block this layer owns inside a `.gitignore` it does not own. */
const MANAGED_START = '# >>> rheplicant-agent (managed) >>>'
const MANAGED_END = '# <<< rheplicant-agent (managed) <<<'

/** The one directory every execution tree lives under, relative to the project. */
export const RESULTS_ROOT = 'results'

/**
 * The directory this layer keeps its own project-level state in.
 *
 * Layout lives HERE rather than beside the one file that currently uses it
 * (the trigger registry), for the same reason `RESULTS_ROOT` does: this module
 * is what the `.gitignore` block is written from, and a path it must ignore
 * cannot be owned by a module it does not import.
 *
 * Close to the per-execution sidecar's name (`.rheplicant-agent.json`) on
 * purpose — both are marked as this layer's own — but a DIRECTORY at the
 * project root rather than a file inside a tree. They never collide.
 */
export const STATE_DIR = '.rheplicant-agent'

/**
 * The `results/` segment for one task: its workspace-relative path, minus the
 * extension.
 *
 * The whole relative path, not the basename: two tasks named `demo.yaml` in
 * different directories are different tasks, and collapsing them to one
 * segment would file their executions together and make the tree lie about
 * which document produced what.
 *
 * @param workspace - the project directory (the session's own).
 * @param taskPath - the task file's absolute, canonical path.
 * @returns a relative segment such as `tasks/demo_small`.
 */
export function taskSegment(workspace: string, taskPath: string): string {
  const rooted = relative(workspace, taskPath)
  const cut = rooted.lastIndexOf('.')
  // Only an extension on the LAST component counts: `a.b/c` has none.
  return cut > rooted.lastIndexOf(sep) && cut > 0 ? rooted.slice(0, cut) : rooted
}

/**
 * Where one execution publishes: `<workspace>/results/<task>/<execution id>`.
 *
 * @param workspace - the project directory.
 * @param taskPath - the task file's absolute, canonical path.
 * @param executionId - the id minted for this call.
 * @returns the absolute directory, which does not exist yet.
 */
export function executionDirectory(
  workspace: string,
  taskPath: string,
  executionId: string,
): string {
  return join(workspace, RESULTS_ROOT, taskSegment(workspace, taskPath), executionId)
}

/** Whether this directory is a git working tree (a worktree's `.git` is a file). */
function isGitRepository(workspace: string): boolean {
  // WALKS UP. A project directory is very rarely a repository ROOT — the
  // common shape is a project nested inside one, and this repo's own
  // `harness/` is exactly that. Checking only `<workspace>/.git` answered "not
  // a repository" for every such project, so the managed block was never
  // written and the published tree turned up as untracked in the parent repo:
  // precisely what §9 decided to prevent. Measured in the first real
  // end-to-end run, 2026-08-23; no unit test could have caught it, because
  // every one of them built a workspace that WAS a repository root.
  //
  // `.git` is tested with `existsSync` rather than `isDirectory`, because in a
  // worktree or a submodule it is a FILE holding a gitdir pointer. Both are
  // repositories, and a check that recognised only the directory form would
  // reintroduce this bug for anyone using either.
  let directory = resolve(workspace)
  for (;;) {
    if (existsSync(join(directory, '.git'))) return true
    const parent = dirname(directory)
    if (parent === directory) return false
    directory = parent
  }
}

/**
 * Everything this layer writes into a project that git should not track.
 *
 * TWO entries, and the second is why this block had to become rewritable. The
 * first, `results/`, is the execution trees. The second is the state directory
 * — today the trigger registry, and whatever this layer keeps beside it later.
 * Both are machine state: self-describing, rebuildable, and never source.
 *
 * The sidecar (`.rheplicant-agent.json`) needs no entry of its own; it lives
 * INSIDE an execution tree and is covered by the first line. The names are
 * close on purpose and never collide — one is a file in a tree, the other a
 * directory at the root.
 */
const IGNORED_PATHS = [`/${RESULTS_ROOT}/`, `/${STATE_DIR}/`]

/**
 * The block exactly as this layer would write it today.
 *
 * The CONTENT is the version. A numbered marker would be a second thing to
 * keep in step with the lines it describes, and the failure mode of forgetting
 * to bump it is silent — a project keeps a stale block that claims to be
 * current. Comparing the text has no such gap: if what is on disk is not what
 * this function returns, it is stale by construction.
 */
function managedBlock(): string {
  return [
    MANAGED_START,
    '# Machine state written by rheplicant-agent: execution trees (each one',
    '# self-describing via .rheplicant-agent.json, never pruned automatically —',
    '# delete a tree to prune it) and this layer\'s own project state.',
    '# Edit outside these markers; the block is rewritten when it changes,',
    '# everything around it is left alone.',
    ...IGNORED_PATHS,
    MANAGED_END,
  ].join('\n')
}

/**
 * Ensure this layer's own paths are ignored, by writing a marked block into
 * the project's `.gitignore` (`docs/project-model.md` §9.1).
 *
 * The user owns that file; this layer owns only the text between its markers,
 * and never touches a byte outside them. Nothing here runs `git`: it writes a
 * file, and does not stage, commit, or read the index.
 *
 * **It REWRITES a stale block, which it did not before**, and that is the whole
 * of this function's history worth knowing. The original returned the moment
 * `MANAGED_START` appeared anywhere in the file, so a block written by an
 * earlier version stayed exactly as it was forever — while the block's own text
 * promised *"the block is rewritten"*. When the trigger registry added a second
 * path to ignore, every project that had ever published an execution would have
 * kept ignoring only the first one, and a schedule file would have turned up as
 * untracked source. The comment was describing behaviour nobody had written;
 * now the behaviour exists and the comment is true.
 *
 * A block whose START marker is present but whose END marker is not is left
 * COMPLETELY ALONE. That shape means someone truncated the file or removed a
 * marker, and there is then no way to know where this layer's text ends —
 * guessing risks deleting lines the user wrote, which is a worse outcome than
 * not ignoring a directory. Deleting the stray marker restores the normal path.
 *
 * @param workspace - the project directory.
 * @returns the path written, or `undefined` when nothing needed writing —
 *   outside a git repository, when the block is already current, and when a
 *   half-marked block cannot be safely replaced.
 */
export function ensureResultsIgnored(workspace: string): string | undefined {
  if (!isGitRepository(workspace)) return undefined
  const path = join(workspace, '.gitignore')
  let existing = ''
  try {
    existing = readFileSync(path, 'utf8')
  } catch {
    // No .gitignore yet: this creates one holding only the managed block.
  }
  const block = managedBlock()
  const next = replaceManagedBlock(existing, block)
  // Already current — the common case on every run after the first.
  if (next === undefined) return undefined
  try {
    writeFileSync(path, next, 'utf8')
  } catch {
    // A read-only project is not a reason to fail a run that otherwise
    // succeeded; the tree is still published and still self-describing.
    return undefined
  }
  return path
}

/**
 * The file with the managed block brought up to date, or undefined when
 * nothing should be written.
 *
 * Split out from {@link ensureResultsIgnored} so the substitution is testable
 * as string arithmetic, without a repository or a filesystem.
 *
 * @param existing - the `.gitignore` as it stands (empty when there is none).
 * @param block - the block this layer would write today.
 * @returns the new file contents, or undefined to leave the file untouched.
 */
export function replaceManagedBlock(existing: string, block: string): string | undefined {
  const start = existing.indexOf(MANAGED_START)
  if (start < 0) {
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
    return `${existing}${separator}${block}\n`
  }
  // Searched FROM the start marker: a file that somehow holds an END before a
  // START is scrambled, and matching that one would splice out user lines.
  const end = existing.indexOf(MANAGED_END, start)
  if (end < 0) return undefined
  const after = end + MANAGED_END.length
  if (existing.slice(start, after) === block) return undefined
  // Everything outside the markers survives byte for byte, including whatever
  // separator followed the old block.
  return `${existing.slice(0, start)}${block}${existing.slice(after)}`
}

/** The facts about an execution that only this layer knows. */
export interface SidecarFacts {
  readonly executionId: string
  readonly task: string
  readonly taskPath: string
  readonly taskDigest: string
  readonly transport: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly sessionId?: string | undefined
  /**
   * The exit kinds this execution ran, VERBATIM from `runs[].kind` — in
   * declaration order, with repeats kept.
   *
   * Recorded rather than derived, because the alternative is reading every
   * execution's document back to answer "what analysis was this", which is one
   * fetch per row on a listing. It is a projection of the document, never a
   * mapping onto anything: §18.2 forbids this repo keeping a kind-to-category
   * table for a grammar it does not own, and a verbatim copy of the list the
   * document declared is not one.
   *
   * Not deduped. An execution that ran `forward` twice and `nuts` once did
   * that, and a summary that says `[forward, nuts]` has quietly answered a
   * different question. Consumers that want the distinct set can take it.
   */
  readonly kinds?: readonly string[] | undefined
}

/** The name of the sidecar, beside upstream's own `.rheplicant-results.json`. */
export const SIDECAR_NAME = '.rheplicant-agent.json'

/**
 * Write the sidecar that makes a published tree self-describing
 * (`docs/project-model.md` §5.1).
 *
 * Upstream's marker records the run directory's identity; the one fact it does
 * not record is which session produced this, which is exactly what makes a
 * tree recoverable when a session log vanishes out of band — there is no
 * session deletion API, but `rm` exists.
 *
 * @param resultsPath - where the tree actually landed, which for a refused
 *   execution is the renamed sibling rather than the directory asked for.
 * @param facts - the identity to record.
 * @returns the path written, or `undefined` when it could not be.
 */
export function writeSidecar(resultsPath: string, facts: SidecarFacts): string | undefined {
  const path = join(resultsPath, SIDECAR_NAME)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ formatVersion: 1, ...facts }, null, 2)}\n`, 'utf8')
  } catch {
    // The tree is upstream's; failing to annotate it must not fail the run.
    return undefined
  }
  return path
}
