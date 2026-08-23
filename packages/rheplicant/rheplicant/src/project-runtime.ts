/**
 * The project seam: `ctx.rheplicantProject` (`docs/project-model.md` §5.1, §6.2).
 *
 * Its own module, and therefore its own cordis row
 * (`@rheplicant/dsh-rheplicant/project-runtime`), because a row mounts a
 * package's DEFAULT export and this package's default is already the compute
 * seam. Two capabilities, two rows.
 *
 * @module @rheplicant/dsh-rheplicant/project-runtime
 */

import { Context, Service } from '@deepseek-ai/cordis'

import {
  readTaskDocument, scanProject, type ProjectContents, type TaskDocument,
} from './contents.ts'
import {
  listExecutions,
  readArtifact,
  type Artifact,
  type ArtifactRequest,
  type ExecutionSummary,
} from './executions.ts'

// The augmentation lives with the service, not in `index.ts`: naming it there
// would drag this module -- and its node:fs imports -- into the browser-face
// type graph, which has no node types and no business seeing a filesystem.
declare module '@deepseek-ai/cordis' {
  interface Context {
    rheplicantProject: ProjectRuntime
  }
}

/**
 * The project seam, registered as `ctx.rheplicantProject`
 * (`docs/project-model.md` §5.1, §6.2).
 *
 * Deliberately NOT a seam-plus-provider pair like `ctx.rheplicant`. That split
 * exists because compute has three interchangeable transports; a project is a
 * directory on the host that published it, and there is nothing to swap. If a
 * remote project ever needs serving, splitting this then is mechanical.
 *
 * Every method takes the project directory explicitly rather than reading one
 * off a context: a call site that cannot name the workspace has no business
 * reading its results, which is the same rule `readTaskFile` enforces for
 * writing them.
 */
export class ProjectRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'rheplicantProject')
  }

  /**
   * Every execution published in one project, newest first.
   * @param workspace - the project directory (the session's own `cwd`).
   * @returns one self-describing summary per execution.
   */
  listExecutions(workspace: string): ExecutionSummary[] {
    return listExecutions(workspace)
  }

  /**
   * One artifact's bytes, served only while the listed execution still owns
   * its directory.
   * @param workspace - the project directory, which bounds the read.
   * @param request - the identity captured at listing time plus the name.
   * @returns the bytes and their media type.
   * @throws ProjectReadError - on confinement, identity, or read failure.
   */
  readArtifact(workspace: string, request: ArtifactRequest): Artifact {
    return readArtifact(workspace, request)
  }

  /**
   * What one project HOLDS: its task documents and its candidate inputs.
   *
   * The companion to {@link listExecutions}, which reports what it has RUN.
   * A project home needs both, and needs them to describe the same instant —
   * hence one scan returning both lists rather than a method each.
   *
   * @param workspace - the project directory.
   * @returns the tasks, the inputs, and whether a scan cap cut the walk short.
   */
  listContents(workspace: string): ProjectContents {
    return scanProject(workspace)
  }

  /**
   * One task document's own bytes — what the operator authored, as it stands
   * on disk right now.
   *
   * Distinct from `readArtifact`'s `config.input.yaml`, which is what a
   * particular execution RAN. Holding both is what makes staleness (§4.2)
   * visible instead of merely recorded.
   *
   * @param workspace - the project directory, which bounds the read.
   * @param relativePath - the task's workspace-relative path.
   * @returns the document's text and file facts.
   * @throws ProjectReadError - on confinement, kind, size or decoding failure.
   */
  readTask(workspace: string, relativePath: string): TaskDocument {
    return readTaskDocument(workspace, relativePath)
  }
}

export default ProjectRuntime
