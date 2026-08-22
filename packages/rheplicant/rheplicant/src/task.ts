/**
 * Task files and execution identity — the host-side half of
 * `docs/project-model.md` §4.
 *
 * Two jobs live here, both shared by `rheplicant_run` / `rheplicant_validate`
 * / `rheplicant_gates` so the rules are stated once:
 *
 * 1. **A task is a file, and the file must be what runs** (§4.3). A tool call
 *    naming `task:` reads that file's exact bytes and sends them as
 *    `documentText`, unparsed — the config grammar has exactly one owner
 *    (rheplicant's own bounded YAML loader, behind the compute service), and
 *    `taskDigest` must be the digest of the bytes that travelled, so parsing
 *    here would put a second owner on the grammar and a second meaning on the
 *    digest.
 * 2. **Path confinement.** The path comes from a model, so it is resolved
 *    against the SESSION's own working directory and refused if it escapes —
 *    lexically first (a `..` walk, an absolute path elsewhere), then again
 *    after canonicalization (a symlink pointing out). There is no fallback to
 *    the host process's own `process.cwd()`: a session with no directory
 *    cannot name a task at all.
 *
 * This module is host-only (it touches `node:fs`) and is deliberately NOT
 * re-exported from the package index, which client bundles reach for types.
 * @module @rheplicant/dsh-rheplicant/task
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ComputeDocument, ComputeInput } from './types.ts'
import { ComputeError } from './types.ts'

/**
 * Characters an execution id's random suffix is drawn from: 32 of them, so
 * five bits of a CSPRNG byte map onto one character with no modulo bias, and
 * none of the four that misread aloud or in a filename (`0`/`1`/`l`/`o`).
 */
const ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'

/**
 * Length of the random suffix. Six characters of a 32-symbol alphabet is 30
 * bits — the suffix only has to separate the runs of ONE task inside ONE
 * second (§4.1: two sessions in a workspace, or one foreground plus one
 * `run_in_background` run), which it does overwhelmingly.
 */
const ID_RANDOM_LENGTH = 6

/** One task file's bytes, and the digest of exactly those bytes. */
export interface TaskFile {
  /** The path as the caller spelled it — what the event and the messages name. */
  readonly path: string
  /** The canonical absolute path the bytes were read from (symlinks resolved). */
  readonly resolvedPath: string
  /** The file's exact bytes as UTF-8 text: the run input, unparsed. */
  readonly text: string
  /** sha256 of the exact bytes, lowercase hex. */
  readonly digest: string
}

/** What one tool call resolved to: the wire payload plus the identity it earned. */
export interface ResolvedTaskInput {
  /** Exactly one of `document` / `documentText`, ready for the seam. */
  readonly input: ComputeInput
  /** sha256 (hex) of the document the user authored. */
  readonly taskDigest: string
  /** Present only when the call named a `task:` file. */
  readonly taskPath?: string
  /** The canonical path the bytes came from; present only for a `task:` call. */
  readonly resolvedTaskPath?: string
}

/**
 * Whether `candidate` is `root` itself or lies under it. Both arguments must
 * already be absolute; canonicalization is the caller's choice, because the
 * check is run twice — once lexically (before touching the filesystem, so a
 * `..` walk is refused without a stat) and once on canonical paths (so a
 * symlink out is refused too).
 */
function contains(root: string, candidate: string): boolean {
  const relation = relative(root, candidate)
  return relation === '' || (!isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`))
}

/**
 * The canonical form of `path`, or `undefined` when it (or a prefix) does not
 * exist. `realpathSync.native` rather than the JavaScript implementation:
 * only the native one follows the filesystem component by component, matching
 * what an open() would actually reach — the JS one lexically collapses `..`
 * before resolving a preceding symlink on some platforms, which is precisely
 * the confusion a confinement check must not inherit.
 */
function canonical(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

/**
 * Read one task file, confined to the session's own directory.
 *
 * @param taskPath - the path as the model spelled it, relative to `cwd`.
 * @param cwd - the SESSION's working directory (`agent.session.header.cwd`),
 *   or `undefined` when the session has none.
 * @param tool - the calling tool's name, so a refusal names its own caller.
 * @returns the file's bytes and their digest.
 * @throws ComputeError - `INVALID_DOCUMENT` when there is no session
 *   directory or the path is empty, `TASK_PATH_ESCAPES_SESSION` when it
 *   resolves outside that directory (lexically or through a symlink), and
 *   `TASK_NOT_READABLE` when the file is missing or is not readable UTF-8.
 */
export function readTaskFile(taskPath: string, cwd: string | undefined, tool: string): TaskFile {
  if (taskPath.trim() === '') {
    throw new ComputeError(`${tool}: \`task\` must name a file; it was empty.`, 'INVALID_DOCUMENT')
  }
  if (cwd === undefined) {
    throw new ComputeError(
      `${tool}: refusing task "${taskPath}" — this session has no working directory to resolve it against. `
      + "A task path is only ever resolved inside the session's own directory, never against the host process's.",
      'INVALID_DOCUMENT',
    )
  }
  const resolved = resolve(cwd, taskPath)
  if (!contains(cwd, resolved)) {
    throw new ComputeError(
      `${tool}: refusing task "${taskPath}" — it resolves to ${resolved}, which is outside the session directory ${cwd}.`,
      'TASK_PATH_ESCAPES_SESSION',
    )
  }
  const root = canonical(cwd)
  if (root === undefined) {
    throw new ComputeError(
      `${tool}: refusing task "${taskPath}" — the session directory ${cwd} does not resolve.`,
      'TASK_NOT_READABLE',
    )
  }
  const target = canonical(resolved)
  if (target === undefined) {
    throw new ComputeError(`${tool}: task file not found: ${resolved}`, 'TASK_NOT_READABLE')
  }
  // Second pass, on canonical paths: the lexical check above cannot see a
  // symlink INSIDE the session directory that points out of it.
  if (!contains(root, target)) {
    throw new ComputeError(
      `${tool}: refusing task "${taskPath}" — it resolves through a symlink to ${target}, which is outside the session directory ${root}.`,
      'TASK_PATH_ESCAPES_SESSION',
    )
  }
  let bytes: Buffer
  try {
    // Read the CANONICAL path, the one the checks above actually cleared.
    bytes = readFileSync(target)
  } catch (error) {
    throw new ComputeError(
      `${tool}: cannot read task file ${target}: ${(error as Error).message}`,
      'TASK_NOT_READABLE',
    )
  }
  const text = bytes.toString('utf8')
  // `toString('utf8')` replaces invalid sequences silently, which would make
  // the bytes that travel differ from the bytes we digested. Refuse instead.
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new ComputeError(`${tool}: task file ${target} is not valid UTF-8.`, 'TASK_NOT_READABLE')
  }
  return {
    path: taskPath,
    resolvedPath: target,
    text,
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
}

/**
 * Deterministic JSON for an inline document: object keys in sorted order, so
 * one document always digests to one value regardless of the order the model
 * happened to emit its keys in.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

/**
 * sha256 (hex) of an inline document. A scratch run has no file to digest,
 * but an execution id still needs its digest half, so the authored object
 * itself stands in — canonicalized (§4.1's rule is that the digest describes
 * what the USER authored, never what ran).
 * @param document - the inline config document.
 * @returns the lowercase hex digest.
 */
export function documentDigest(document: ComputeDocument): string {
  return createHash('sha256').update(stableStringify(document), 'utf8').digest('hex')
}

/**
 * Resolve one tool call's document to the wire payload plus its identity.
 * Exactly one of `task` / `document` may be present.
 *
 * @param tool - the calling tool's name, for the refusal text.
 * @param args - the model's `task` and `document` arguments.
 * @param cwd - the session's working directory, or `undefined`.
 * @returns the seam input, the authored document's digest, and the task path.
 * @throws ComputeError - `INVALID_DOCUMENT` when neither or both are given;
 *   see {@link readTaskFile} for the path refusals.
 */
export function resolveTaskInput(
  tool: string,
  args: { readonly task?: string | undefined; readonly document?: ComputeDocument | undefined },
  cwd: string | undefined,
): ResolvedTaskInput {
  const hasTask = args.task !== undefined
  const hasDocument = args.document !== undefined
  if (hasTask === hasDocument) {
    throw new ComputeError(
      `${tool} takes exactly one of \`task\` (a path to a document in the project — the preferred form) `
      + `or \`document\` (an inline document, for scratch work); ${hasTask ? 'both were given' : 'neither was given'}.`,
      'INVALID_DOCUMENT',
    )
  }
  if (args.document !== undefined) {
    return { input: { document: args.document }, taskDigest: documentDigest(args.document) }
  }
  const file = readTaskFile(args.task as string, cwd, tool)
  return {
    input: { documentText: file.text },
    taskDigest: file.digest,
    taskPath: file.path,
    resolvedTaskPath: file.resolvedPath,
  }
}

/** `2026-08-22T13:45:01.123Z` -> `20260822T134501Z`: the id's leading segment. */
function compactUtc(when: Date): string {
  return when.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

/** Six characters from {@link ID_ALPHABET}, drawn from the platform CSPRNG. */
function randomSuffix(): string {
  const bytes = randomBytes(ID_RANDOM_LENGTH)
  let suffix = ''
  // `charAt` (not `[i]`): it is typed `string`, so the loop needs no
  // non-null assertion under `noUncheckedIndexedAccess`, and `byte & 31` is
  // in range for a 32-character alphabet by construction.
  for (const byte of bytes) suffix += ID_ALPHABET.charAt(byte & 31)
  return suffix
}

/**
 * Mint one execution id: `<UTC compact>-<first 8 of taskDigest>-<6 random>`,
 * e.g. `20260822T134501Z-3f9ac2b1-k7m2xq` (`docs/project-model.md` §4.1).
 *
 * The digest half comes from the document the USER authored, never from what
 * ran — the executed bytes will eventually contain the execution directory,
 * which contains this id, so deriving it from them would be circular. The
 * random half is not decoration: timestamp+digest alone collides for two runs
 * of one task inside one second, which two ordinary things reach (two
 * sessions in one workspace; one session issuing a foreground run alongside a
 * `run_in_background: true` one), and the loser of that collision would
 * either hit the "target exists" refusal or, under `clobber: true`, destroy
 * the winner's results tree.
 *
 * @param taskDigest - the authored document's sha256, hex.
 * @param when - the mint time; defaults to now. Injectable for tests.
 * @returns the execution id.
 */
export function mintExecutionId(taskDigest: string, when: Date = new Date()): string {
  return `${compactUtc(when)}-${taskDigest.slice(0, 8)}-${randomSuffix()}`
}
