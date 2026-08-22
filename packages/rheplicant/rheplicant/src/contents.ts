/**
 * What a project HOLDS, as opposed to what it has run: the task documents an
 * operator could run and the data files those documents could reference.
 *
 * `docs/project-model.md` §6.0 and §7. The companion to `executions.ts` — that
 * module reads the tree this layer WROTE, this one reads the tree the operator
 * wrote. Three properties, each of which cost a design decision:
 *
 * * **Scan, never a convention.** §7 sketches `tasks/<name>.yaml` and
 *   `inputs/`, and nothing in this codebase enforces either: `readTaskFile`
 *   accepts any path inside the workspace, so a project home that listed only
 *   two blessed directories would report an empty project for every layout but
 *   one. The walk covers the whole workspace and the layout stays the
 *   operator's business.
 * * **An extension is a filter here, never a format claim.** rheplicant's
 *   `file:` reader refuses to infer a format from an extension on purpose —
 *   "two producers of the same extension disagree often enough that guessing is
 *   how a run reads the wrong thing quietly" (`config/files.py`). So this
 *   module reports the extension it matched on and nothing more; the
 *   document's own `format:` key remains the only thing that decides how bytes
 *   are read.
 * * **The caps are announced.** A walk that quietly stopped would render as a
 *   complete listing of a project that is missing half its tasks, which is
 *   worse than saying so. {@link ProjectContents.truncated} is the difference
 *   between "this is everything" and "this is what fit".
 *
 * What this module deliberately does NOT do is parse a task document. Which
 * inputs a given task actually references is a question only a YAML parse can
 * answer, and the host has never parsed one — `readTaskFile` reads bytes and
 * digests them, and every interpretation happens in the Python service that
 * owns the grammar. Adding a parser here would put a second, drifting reading
 * of the document in the host. The listing therefore answers "what is in this
 * project", not "what does this task use".
 */

import { lstatSync, readdirSync, type Dirent } from 'node:fs'
import { extname, join } from 'node:path'

import { RESULTS_ROOT } from './project.ts'

/**
 * Extensions that make a file a task document.
 *
 * Both spellings of YAML, because the operator picks one and a listing that
 * knew only `.yaml` would hide half a project for a naming preference.
 */
export const TASK_EXTENSIONS: ReadonlySet<string> = new Set(['yaml', 'yml'])

/**
 * Extensions that make a file a candidate input.
 *
 * Grounded in rheplicant's own reader registry rather than guessed: `npy`,
 * `npz`, `txt` and `csv` are the four `@register_reader` formats a `file:`
 * value node can carry, `fits` is the HEALPix map form read at
 * `resources.beams`, `h5`/`hdf5` are the array containers a project keeps
 * beside them, and `s<N>p` is Touchstone's own conventional spelling.
 *
 * A FILTER, not a format table — see this module's header. Matching here says
 * a file is worth showing in the project home, never how it would be read.
 */
export const INPUT_EXTENSIONS: ReadonlySet<string> = new Set([
  'npy', 'npz', 'txt', 'csv', 'fits', 'h5', 'hdf5', 's1p', 's2p', 's3p', 's4p',
])

/** Directory names never walked, whatever depth they appear at. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '__pycache__'])

/** How deep below the workspace the walk goes before it gives up. */
export const MAX_SCAN_DEPTH = 8

/**
 * How many directory entries the walk visits before it stops and says so.
 *
 * Not a performance tuning knob: a workspace is an arbitrary directory an
 * operator chose, and it can be a home directory. This is the bound that keeps
 * one unlucky choice from hanging the project home, and {@link
 * ProjectContents.truncated} is how the listing admits it hit the bound.
 */
export const MAX_SCAN_ENTRIES = 4096

/** One file the project holds. */
export interface ProjectFile {
  /** Workspace-relative, POSIX separators, e.g. `tasks/fit.yaml`. */
  readonly path: string
  readonly bytes: number
  /** ISO-8601 modification instant. */
  readonly modifiedAt: string
}

/** One task document: something an operator could hand to `run`. */
export type TaskSummary = ProjectFile

/** One candidate input, reported by the extension it matched on. */
export interface InputSummary extends ProjectFile {
  /**
   * The lowercase extension, without its dot. Deliberately not called
   * `format`: this layer matched on it, rheplicant would not read on it.
   */
  readonly extension: string
}

/** Everything one walk of a project found, and whether it found all of it. */
export interface ProjectContents {
  readonly tasks: readonly TaskSummary[]
  readonly inputs: readonly InputSummary[]
  /** True when a cap stopped the walk, so these lists are incomplete. */
  readonly truncated: boolean
}

/**
 * Every task document and candidate input in one project.
 *
 * One walk classifying each file, rather than two walks with a predicate each:
 * the two lists then describe the same snapshot of the tree, share one entry
 * budget, and cannot disagree about whether they were truncated.
 *
 * A symlink is never followed and never listed, matching `listExecutions` and
 * `readArtifact`. The reason is the same in all three places: the project tree
 * is something an operator wrote in a directory this layer reads by path, and
 * a link is the one entry whose name does not describe what reading it gets.
 *
 * @param workspace - the project directory.
 * @returns the tasks, the inputs, and whether a cap cut the walk short. A
 *   workspace that does not exist or cannot be read answers empty rather than
 *   throwing: a project home renders "no tasks yet" for a missing directory
 *   perfectly well, and has nothing useful to do with an exception.
 */
export function scanProject(workspace: string): ProjectContents {
  const tasks: TaskSummary[] = []
  const inputs: InputSummary[] = []
  // The one subtree that is ours. Compared as a PATH, not by name: a
  // `studies/results/` an operator made is their directory, not our tree, and
  // skipping it by name would hide their tasks to protect ours.
  const ourResults = join(workspace, RESULTS_ROOT)
  let visited = 0
  let truncated = false

  const walk = (directory: string, prefix: string, depth: number): void => {
    if (depth > MAX_SCAN_DEPTH || truncated) return
    let entries: Dirent[]
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      // Unreadable is not exceptional here — a permission-denied subdirectory
      // is a normal thing to meet inside someone's project, and the rest of
      // the listing is still worth returning.
      return
    }
    for (const entry of entries) {
      if (visited >= MAX_SCAN_ENTRIES) {
        truncated = true
        return
      }
      visited += 1
      const child = join(directory, entry.name)
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      // `isDirectory()`/`isFile()` are false for a symlink under
      // `withFileTypes`, so both branches decline links without a second test.
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        if (child === ourResults) continue
        walk(child, relative, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const extension = extname(entry.name).slice(1).toLowerCase()
      const isTask = TASK_EXTENSIONS.has(extension)
      if (!isTask && !INPUT_EXTENSIONS.has(extension)) continue
      const found = describe(child, relative)
      if (found === undefined) continue
      if (isTask) tasks.push(found)
      else inputs.push({ ...found, extension })
    }
  }

  walk(workspace, '', 0)
  const byPath = (left: ProjectFile, right: ProjectFile): number =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  return {
    tasks: tasks.sort(byPath),
    inputs: inputs.sort(byPath),
    truncated,
  }
}

/** Size and mtime for one matched file, or undefined when it went away. */
function describe(absolute: string, relative: string): ProjectFile | undefined {
  let identity
  try {
    // `lstat`, not `stat`: the caller already declined links by Dirent kind,
    // and staying on `lstat` keeps that decision in one shape rather than
    // reintroducing link-following one syscall later.
    identity = lstatSync(absolute)
  } catch {
    return undefined
  }
  if (!identity.isFile()) return undefined
  return {
    path: relative,
    bytes: identity.size,
    modifiedAt: identity.mtime.toISOString(),
  }
}
