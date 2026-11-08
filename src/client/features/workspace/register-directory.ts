/** Register an existing user directory as a direct workspace for one version. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  InspectWorkspaceRequest, ProjectRecord, RegisterWorkspaceRequest, RepositoryBranches, RepositoryBranchesRequest,
  WorkspaceInspection, WorkspaceRecord,
} from 'dsh-workloom/types'
import { failureReport } from '../../ui/failure.ts'
import type { WorkspaceCreateOutcome } from './WorkspaceChoice.tsx'

/** Remote calls needed to inspect and register a directory. */
export interface RegisterDirectoryDeps {
  readonly inspectWorkspace: (request: InspectWorkspaceRequest) => Promise<RemoteResult<WorkspaceInspection>>
  readonly registerWorkspace: (request: RegisterWorkspaceRequest) => Promise<RemoteResult<WorkspaceRecord>>
  readonly repositoryBranches: (request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>
}

/** Inputs for turning an existing directory into a direct workspace. */
export interface RegisterDirectoryInput {
  readonly path: string
  readonly versionId: string
  readonly lockId: string
  readonly project: ProjectRecord
}

/**
 * Register a user-chosen directory without moving or copying its files.
 *
 * A directory may be a project workspace root containing each repository at its
 * configured sub-path, or the single repository itself. The second form maps the
 * only source to `.` so a one-repository project works with a plain repo folder.
 * @param deps - Remote inspection, registration and branch calls.
 * @param input - directory, version, Lock and project.
 * @returns the registered workspace or a localized failure report.
 */
export async function registerDirectoryWorkspace(deps: RegisterDirectoryDeps, input: RegisterDirectoryInput): Promise<WorkspaceCreateOutcome> {
  const inspected = await deps.inspectWorkspace({ path: input.path, versionId: input.versionId })
  if (!inspected.ok) return { ok: false, error: failureReport(inspected.error.code, inspected.error.message) }
  const failed = inspected.value.repositories.filter(repository => repository.error !== undefined)
  let repositories: RegisterWorkspaceRequest['repositories']

  if (failed.length > 0) {
    const sources = input.project.config.sources
    if (sources.length !== 1) {
      const detail = failed.map(repository => `${repository.directory}: ${repository.error ?? 'not_git'}`).join('; ')
      return { ok: false, error: { ...failureReport('invalid_workspace_path', detail), detail } }
    }
    const branches = await deps.repositoryBranches({ repo: input.path })
    if (!branches.ok) return { ok: false, error: failureReport(branches.error.code, branches.error.message) }
    if (branches.value.topLevel === undefined) {
      return { ok: false, error: failureReport('invalid_workspace_path', input.path) }
    }
    repositories = [{ sourceId: String(sources[0]!.id), path: '.', targetPath: input.path }]
  }

  const registered = await deps.registerWorkspace({
    path: input.path,
    versionId: input.versionId,
    lockId: input.lockId,
    mode: 'direct',
    ...(repositories === undefined ? {} : { repositories }),
  })
  return registered.ok
    ? { ok: true, workspace: registered.value }
    : { ok: false, error: failureReport(registered.error.code, registered.error.message) }
}
