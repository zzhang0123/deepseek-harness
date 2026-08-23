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
 * Ensure `results/` is ignored, by writing a marked block into the project's
 * `.gitignore` (`docs/project-model.md` §9.1).
 *
 * The user owns that file; this layer owns only the text between its markers,
 * and never touches a line outside them. Writing is idempotent — a second
 * execution finds the block and does nothing rather than appending a
 * duplicate. Nothing here runs `git`: it writes a file, and does not stage,
 * commit, or read the index.
 *
 * @param workspace - the project directory.
 * @returns the path written, or `undefined` when nothing needed writing —
 *   which is the case outside a git repository, and once the block exists.
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
  if (existing.includes(MANAGED_START)) return undefined
  const block = [
    MANAGED_START,
    '# Execution trees published by rheplicant runs. Each is self-describing',
    '# (.rheplicant-agent.json), and nothing is ever pruned automatically —',
    '# delete a tree to prune it. Edit outside these markers; the block is',
    '# rewritten, everything around it is left alone.',
    `/${RESULTS_ROOT}/`,
    MANAGED_END,
    '',
  ].join('\n')
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
  try {
    writeFileSync(path, `${existing}${separator}${block}`, 'utf8')
  } catch {
    // A read-only project is not a reason to fail a run that otherwise
    // succeeded; the tree is still published and still self-describing.
    return undefined
  }
  return path
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
