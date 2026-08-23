/**
 * Reading a project's published executions: the listing, and one artifact
 * served under an identity check.
 *
 * `docs/project-model.md` §5.1 and §6.2. The companion to `project.ts`, which
 * writes the layout this module reads. Two properties matter more than
 * convenience here:
 *
 * * **There is no ledger.** Listing is a directory read, so nothing can drift
 *   from the tree. Any index added later is a cache rebuildable by scanning.
 * * **A host read at a caller-named path is a trust surface.** Every read is
 *   confined to the workspace's own `results/` tree and passes the
 *   `(path, marker_id, device, inode)` check before a byte is served.
 */

import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync,
  type Dirent, type Stats,
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import { RESULTS_ROOT, SIDECAR_NAME } from './project.ts'

/** Upstream's ownership marker, written into every published execution. */
export const MARKER_NAME = '.rheplicant-results.json'

/** `run_directory_id` is a UUID; anything else is a malformed marker. */
const MARKER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The flat audit files a caller may ask for, and what they are.
 *
 * An allow-list, not a filter: the set of readable names is fixed here rather
 * than derived from the request, so no request can name its way to a file this
 * layer did not intend to serve. Mirrors `rheplicant.gui.outputs`'s own table.
 */
export const ARTIFACT_MEDIA_TYPES: Readonly<Record<string, string>> = {
  'config.input.yaml': 'application/yaml',
  'config.resolved.yaml': 'application/yaml',
  'provenance.json': 'application/json',
  'diagnostics.json': 'application/json',
  'products.json': 'application/json',
  'report.json': 'application/json',
  'report.txt': 'text/plain; charset=utf-8',
  [MARKER_NAME]: 'application/json',
  [SIDECAR_NAME]: 'application/json',
}

/** Ceiling on one artifact, matching the Python reader's own limit. */
export const ARTIFACT_READ_LIMIT = 64 * 1024 * 1024

/** How deep below `results/` a task may nest before the walk gives up. */
const MAX_TASK_DEPTH = 8

/** How an execution ended, read off its directory name. */
export type ExecutionStatus = 'ok' | 'refused' | 'error'

/** One published execution, as the tree describes itself. */
export interface ExecutionSummary {
  /** The id this execution was minted with, without any failure suffix. */
  readonly executionId: string
  /** The task's `results/` segment, e.g. `tasks/demo_small`. */
  readonly task: string
  readonly status: ExecutionStatus
  /** Absolute path of the directory that exists (suffix included). */
  readonly resultsPath: string
  /** Upstream's `run_directory_id`, or null when the marker is unreadable. */
  readonly markerId: string | null
  /** Identity of the directory itself, captured at listing time. */
  readonly device: number
  readonly inode: number
  /** Facts from our own sidecar, absent when it was never written. */
  readonly startedAt?: string
  readonly finishedAt?: string
  readonly sessionId?: string
  readonly taskDigest?: string
  readonly transport?: string
}

/** A refusal this module raises; carries a stable code for the caller. */
export class ProjectReadError extends Error {
  constructor(message: string, readonly code: ProjectReadErrorCode) {
    super(message)
    this.name = 'ProjectReadError'
  }
}

export type ProjectReadErrorCode =
  | 'PATH_ESCAPES_PROJECT'
  | 'ARTIFACT_NOT_ALLOWED'
  | 'EXECUTION_NOT_FOUND'
  | 'IDENTITY_CHANGED'
  | 'ARTIFACT_UNREADABLE'
  | 'ARTIFACT_TOO_LARGE'

/** `<id>.refused-<stamp>-<pid>` -> `{ id, status }`; a plain name is `ok`. */
function splitFailureSuffix(name: string): { id: string; status: ExecutionStatus } {
  for (const [marker, status] of [['.refused-', 'refused'], ['.error-', 'error']] as const) {
    const at = name.indexOf(marker)
    if (at > 0) return { id: name.slice(0, at), status }
  }
  return { id: name, status: 'ok' }
}

/** Parse and validate upstream's marker; null when it is absent or malformed. */
function readMarkerId(directory: string): string | null {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(join(directory, MARKER_NAME), 'utf8'))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  if (row.format_version !== 1 || typeof row.run_directory_id !== 'string') return null
  return MARKER_ID.test(row.run_directory_id) ? row.run_directory_id : null
}

/** Our own sidecar's facts, or an empty object when it is absent or malformed. */
function readSidecar(directory: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(directory, SIDECAR_NAME), 'utf8'))
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** One sidecar field, only when it is a non-empty string. */
function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Every execution published in this project, newest directory name first.
 *
 * An execution is any directory holding upstream's marker — which is what makes
 * the tree self-describing, and what keeps this listing honest about entries it
 * did not write. Two things under `results/<task>/` are deliberately NOT
 * executions and are skipped by that same test: the publication lease's
 * `.rheplicant-lock-<digest>.lock`, which is a SIBLING of the execution
 * directories rather than inside one, and the intermediate task directories
 * themselves.
 *
 * @param workspace - the project directory (the session's own).
 * @returns one summary per execution; empty when the project has never run one.
 */
export function listExecutions(workspace: string): ExecutionSummary[] {
  const root = join(workspace, RESULTS_ROOT)
  const found: ExecutionSummary[] = []

  const walk = (directory: string, depth: number): void => {
    if (depth > MAX_TASK_DEPTH) return
    let entries: Dirent[]
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      // Only directories can be executions, which is what skips the lock file
      // without naming it. A symlink is never followed: an execution tree is
      // something this layer wrote, and it wrote no links.
      if (!entry.isDirectory()) continue
      const child = join(directory, entry.name)
      const summary = summarize(root, child, entry.name)
      if (summary === undefined) {
        walk(child, depth + 1)
        continue
      }
      found.push(summary)
    }
  }

  walk(root, 0)
  // Newest first. Ids lead with a compact UTC stamp, so lexicographic
  // descending IS chronological descending without reading a clock.
  return found.sort((left, right) => (left.executionId < right.executionId ? 1 : -1))
}

/** One directory as an execution summary, or undefined when it is not one. */
function summarize(root: string, directory: string, name: string): ExecutionSummary | undefined {
  const markerId = readMarkerId(directory)
  if (markerId === null && !hasMarkerFile(directory)) return undefined
  let identity: Stats
  try {
    identity = lstatSync(directory)
  } catch {
    return undefined
  }
  const { id, status } = splitFailureSuffix(name)
  const sidecar = readSidecar(directory)
  const task = relative(root, directory).split(sep).slice(0, -1).join('/')
  return {
    executionId: id,
    task: text(sidecar, 'task') ?? task,
    status,
    resultsPath: directory,
    markerId,
    device: identity.dev,
    inode: identity.ino,
    ...pick(sidecar, 'startedAt', 'finishedAt', 'sessionId', 'taskDigest', 'transport'),
  }
}

/** Whether the marker FILE is present, regardless of whether it parses. */
function hasMarkerFile(directory: string): boolean {
  try {
    return lstatSync(join(directory, MARKER_NAME)).isFile()
  } catch {
    return false
  }
}

/** The named sidecar fields that are present, as an object to spread. */
function pick(row: Record<string, unknown>, ...keys: string[]): Record<string, string> {
  const found: Record<string, string> = {}
  for (const key of keys) {
    const value = text(row, key)
    if (value !== undefined) found[key] = value
  }
  return found
}

/** What a caller must present to be served one artifact. */
export interface ArtifactRequest {
  /** The execution directory, as `listExecutions` reported it. */
  readonly resultsPath: string
  /** Upstream's marker id, as reported alongside it. */
  readonly markerId: string
  /** The directory's identity when it was listed. */
  readonly device: number
  readonly inode: number
  /** One name from {@link ARTIFACT_MEDIA_TYPES}. */
  readonly name: string
}

/** One artifact's bytes and what they are. */
export interface Artifact {
  readonly bytes: Buffer
  readonly mediaType: string
}

/**
 * Serve one artifact, only while the execution the caller listed still owns
 * that directory.
 *
 * The check is the Python reader's, in the order that makes each step mean
 * something: confine the path to this project, refuse a symlinked directory,
 * compare the directory's `(device, inode)` against the identity captured at
 * listing time, then compare upstream's marker id. A directory that was
 * deleted and re-created under the same name fails the inode check; one that
 * was re-run fails the marker check; the second exists because inode numbers
 * are reused.
 *
 * **Known difference from the Python implementation, stated rather than
 * papered over.** `rheplicant.gui.outputs` opens the execution directory once
 * and does every subsequent read `dir_fd`-relative, so no path component can be
 * swapped underneath it. Node exposes no `openat`, so this reads by path with
 * `O_NOFOLLOW` on the final component and re-checks identity after each open.
 * That closes the final-component race and leaves a narrow one on an
 * intermediate directory. For a single-user tool reading a tree it wrote
 * itself, that residue is acceptable; it would not be if this ever served an
 * untrusted caller.
 *
 * @param workspace - the project directory, which bounds every read.
 * @param request - the execution's identity plus the artifact name.
 * @returns the bytes and their media type.
 * @throws ProjectReadError - on any confinement, identity, or read failure.
 */
export function readArtifact(workspace: string, request: ArtifactRequest): Artifact {
  const mediaType = ARTIFACT_MEDIA_TYPES[request.name]
  if (mediaType === undefined) {
    throw new ProjectReadError(
      `${JSON.stringify(request.name)} is not an artifact this project serves; `
      + `the readable set is ${Object.keys(ARTIFACT_MEDIA_TYPES).join(', ')}.`,
      'ARTIFACT_NOT_ALLOWED',
    )
  }
  const directory = confine(workspace, request.resultsPath)

  let identity: Stats
  try {
    identity = lstatSync(directory)
  } catch {
    throw new ProjectReadError(
      `execution directory ${directory} is gone; the results may have been pruned.`,
      'EXECUTION_NOT_FOUND',
    )
  }
  if (!identity.isDirectory()) {
    throw new ProjectReadError(
      `${directory} is not a directory (a symlink here is refused, never followed).`,
      'IDENTITY_CHANGED',
    )
  }
  if (identity.dev !== request.device || identity.ino !== request.inode) {
    throw new ProjectReadError(
      `${directory} no longer names the execution that was listed; refresh before opening it.`,
      'IDENTITY_CHANGED',
    )
  }
  if (readMarkerId(directory) !== request.markerId) {
    throw new ProjectReadError(
      `${directory} carries a different results marker than the execution that was listed; `
      + 'it has been re-run. Refresh before opening it.',
      'IDENTITY_CHANGED',
    )
  }
  return { bytes: readRegularFile(join(directory, request.name)), mediaType }
}

/** Resolve one caller-named path and refuse anything outside `results/`. */
function confine(workspace: string, candidate: string): string {
  if (!isAbsolute(candidate)) {
    throw new ProjectReadError(
      `an execution path must be absolute; got ${JSON.stringify(candidate)}.`,
      'PATH_ESCAPES_PROJECT',
    )
  }
  const root = resolve(workspace, RESULTS_ROOT)
  const target = resolve(candidate)
  const inside = target === root || target.startsWith(root + sep)
  if (!inside) {
    throw new ProjectReadError(
      `${target} is outside this project's results tree (${root}).`,
      'PATH_ESCAPES_PROJECT',
    )
  }
  return target
}

/**
 * Read one regular file, under a size ceiling, without following a link.
 *
 * Exported because it is the project's ONE hardened read: `contents.ts` serves
 * task documents through it too, and a second implementation of these rules is
 * a second place for them to drift.
 *
 * Open FIRST, then decide from the descriptor. The obvious order — `lstat`,
 * decide, then open — leaves a window in which the thing examined is not the
 * thing read, and it makes `O_NOFOLLOW` decorative, because `lstat` would have
 * rejected the symlink before the flag could. Opening first collapses both:
 * `O_NOFOLLOW` is what refuses a link (ELOOP), and `fstat` describes the exact
 * file now held open, so there is no window to race.
 *
 * `O_NONBLOCK` is not an optimisation. Without it, opening a FIFO parked in the
 * tree would block this read forever waiting for a writer; with it the open
 * returns at once and `isFile()` rejects it.
 */
export function readRegularFile(path: string, limit: number = ARTIFACT_READ_LIMIT): Buffer {
  let fd: number
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    throw new ProjectReadError(
      `${path} is unavailable, or is a symbolic link this layer will not follow.`,
      'ARTIFACT_UNREADABLE',
    )
  }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) {
      throw new ProjectReadError(`${path} is not a regular file.`, 'ARTIFACT_UNREADABLE')
    }
    if (opened.size > limit) {
      throw new ProjectReadError(
        `${path} is ${opened.size} bytes, over the ${limit}-byte read limit.`,
        'ARTIFACT_TOO_LARGE',
      )
    }
    const bytes = Buffer.alloc(opened.size)
    let filled = 0
    while (filled < bytes.length) {
      const read = readSync(fd, bytes, filled, bytes.length - filled, filled)
      if (read === 0) break
      filled += read
    }
    return filled === bytes.length ? bytes : bytes.subarray(0, filled)
  } finally {
    closeSync(fd)
  }
}
