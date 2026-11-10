/**
 * Workspace creation, reuse and cleanup actions used by the version and task
 * forms.
 *
 * The Hook keeps the multi-step Host workflows (prepare, adopt, reuse, retire)
 * out of the shell; every mutation refreshes the catalog through `onChanged`.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CatalogSnapshot, ProjectRecord, VersionRecord, VersionWorkspaceInput, WorkspaceRecord,
} from 'dsh-workloom/types'
import type { LoomHostPort } from '../../../ports/loom-host.ts'
import { autoWorkspaceRepositoryPath } from '../../../domain/workspace.ts'
import { failureReport } from '../../ui/failure.ts'
import { workspaceBranch } from './workspace-refs.ts'
import { registerDirectoryWorkspace } from './register-directory.ts'
import { reuseWorkspace, reuseTargetOf, type ReuseWorkspaceOutcome } from '../version/reuse-workspace.ts'
import { createVersionAdoptingLinkedDirectory, createVersionReusingWorkspace as createVersionReusingWorkspaceRemote } from '../version/create-version-reuse.ts'
import type { WorkspaceCreateOutcome, WorkspaceCreationInput } from './WorkspaceChoice.tsx'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for {@link useLoomWorkspaceActions}. */
export interface LoomWorkspaceActionsInput {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot | undefined
  readonly displayVersion: VersionRecord | undefined
  readonly displayVersionProject: ProjectRecord | undefined
  readonly currentVersion: VersionRecord | undefined
  readonly currentVersionProject: ProjectRecord | undefined
  readonly prepareWorkspace: LoomHostPort['prepareWorkspace']
  readonly prepareWorkspaceSilent: LoomHostPort['prepareWorkspaceSilent']
  readonly cleanupWorkspace: LoomHostPort['cleanupWorkspace']
  readonly cleanupWorkspaceSilent: LoomHostPort['cleanupWorkspaceSilent']
  readonly registerWorkspace: LoomHostPort['registerWorkspace']
  readonly workspaceStatus: LoomHostPort['workspaceStatus']
  readonly inspectWorkspace: LoomHostPort['inspectWorkspace']
  readonly repositoryBranches: LoomHostPort['repositoryBranches']
  readonly updateWorkspace: LoomHostPort['updateWorkspace']
  readonly deleteWorkspace: LoomHostPort['deleteWorkspace']
  readonly createVersion: LoomHostPort['createVersion']
  readonly generateLock: LoomHostPort['generateLock']
  readonly deleteVersion: LoomHostPort['deleteVersion']
  /** Refresh the catalog after a successful mutation. */
  readonly onChanged: () => void
}

/** Workspace actions consumed by the route content and form dialogs. */
export interface LoomWorkspaceActions {
  readonly addVersionWorkspace: (input: VersionWorkspaceInput) => Promise<RemoteResult<WorkspaceRecord>>
  readonly reuseVersionWorkspace: (workspaceId: string) => Promise<RemoteResult<WorkspaceRecord>>
  readonly createVersionWithAdoption: (request: Parameters<LoomHostPort['createVersion']>[0]) => Promise<RemoteResult<VersionRecord>>
  readonly createVersionReusingWorkspace: (request: Parameters<LoomHostPort['createVersion']>[0], workspaceId: string) => Promise<RemoteResult<VersionRecord>>
  readonly createTaskWorkspace: (input: WorkspaceCreationInput) => Promise<WorkspaceCreateOutcome>
  readonly registerTaskDirectory: (path: string) => Promise<WorkspaceCreateOutcome>
  readonly renameVersionWorkspace: (workspaceId: string, label: string) => Promise<RemoteResult<WorkspaceRecord>>
  readonly removeVersionWorkspace: (workspaceId: string, deleteFiles?: boolean, confirmPath?: string) => Promise<RemoteResult<void>>
}

/** Adapter surface required by the shared reuse workflow. */
interface ReusePorts {
  readonly cleanupWorkspace: LoomHostPort['cleanupWorkspace']
  readonly registerWorkspace: LoomHostPort['registerWorkspace']
  readonly workspaceStatus: LoomHostPort['workspaceStatus']
}

/**
 * Build the workspace action set for the shell.
 *
 * @param input - locale, current selections, Host ports and refresh callback.
 * @returns version/task workspace actions.
 */
export function useLoomWorkspaceActions(input: LoomWorkspaceActionsInput): LoomWorkspaceActions {
  const {
    t, snapshot, displayVersion, displayVersionProject, currentVersion, currentVersionProject,
    prepareWorkspace, prepareWorkspaceSilent, cleanupWorkspace, cleanupWorkspaceSilent,
    registerWorkspace, workspaceStatus, inspectWorkspace, repositoryBranches,
    updateWorkspace, deleteWorkspace, createVersion, generateLock, deleteVersion, onChanged,
  } = input
  const reusePorts: ReusePorts = {
    cleanupWorkspace: cleanupWorkspaceSilent ?? cleanupWorkspace,
    registerWorkspace,
    workspaceStatus,
  }
  const prepareAutoWorkspace = async (
    version: VersionRecord,
    project: ProjectRecord,
    workspace: { readonly parentPath: string; readonly name: string; readonly branchPrefix?: string | undefined; readonly branchName?: string | undefined },
  ): Promise<RemoteResult<WorkspaceRecord>> => {
    if (snapshot === undefined) throw new Error(t('state.error'))
    const lock = snapshot.locks.filter(candidate => candidate.versionId === version.id).at(-1)
    if (lock === undefined) throw new Error(t('lock.generateFirst'))
    const parent = workspace.parentPath.replace(/\/+$/u, '')
    const root = `${parent}/${workspace.name}`
    const branch = workspaceBranch(workspace.branchPrefix, workspace.name, workspace.branchName)
    const branches: Record<string, string> = {}
    const repositories = lock.repositories.map(entry => {
      const source = project.config.sources.find(candidate => candidate.id === entry.sourceId)
      if (source === undefined) throw new Error(t('error.workspaceMismatch'))
      const subProjectId = entry.subProjectId === undefined ? 'default' : String(entry.subProjectId)
      const path = autoWorkspaceRepositoryPath(subProjectId, source)
      branches[String(source.id)] = branch
      return { sourceId: String(source.id), path, targetPath: `${root}/${path}` }
    })
    const result = await (prepareWorkspaceSilent ?? prepareWorkspace)({ path: root, versionId: version.id, lockId: lock.id, mode: 'managed', repositories, branches, requireBranches: true })
    if (!result.ok) return result
    if (result.value.preparation?.status === 'failed') {
      const failed = result.value.preparation.repositories.filter(repository => repository.status === 'failed')
      const reason = failed.length > 0
        ? failed.map(repository => `${repository.path ?? String(repository.sourceId)}: ${repository.error ?? 'failed'}`).join('; ')
        : result.value.preparation.error ?? t('error.workspaceNotPrepared')
      const cleanup = await (cleanupWorkspaceSilent ?? cleanupWorkspace)({ workspaceId: result.value.id, discardChanges: true })
      onChanged()
      throw new Error(cleanup.ok ? reason : `${reason}; cleanup failed: ${cleanup.error.message}`)
    }
    onChanged()
    return result
  }
  const reuseIntoVersion = async (version: VersionRecord, lockId: string, workspaceId: string): Promise<ReuseWorkspaceOutcome> => {
    const workspace = snapshot?.workspaces.find(candidate => candidate.id === workspaceId)
    if (workspace === undefined) return { ok: false, code: 'missing_workspace', message: 'the workspace no longer exists', stage: 'check' }
    const ownerProjectId = workspace.projectId ?? snapshot?.versions.find(candidate => candidate.id === workspace.versionId)?.projectId
    return reuseWorkspace(reusePorts, {
      workspace: { ...reuseTargetOf(workspace), projectId: ownerProjectId },
      versionId: version.id,
      projectId: ownerProjectId,
      lockId,
    })
  }
  const addVersionWorkspace = async (workspace: VersionWorkspaceInput): Promise<RemoteResult<WorkspaceRecord>> => {
    if (displayVersion === undefined || displayVersionProject === undefined) throw new Error(t('state.error'))
    if (workspace.mode !== 'auto') throw new Error(t('workspace.auto'))
    return prepareAutoWorkspace(displayVersion, displayVersionProject, workspace)
  }
  const reuseVersionWorkspace = async (workspaceId: string): Promise<RemoteResult<WorkspaceRecord>> => {
    if (displayVersion === undefined) throw new Error(t('state.error'))
    const lock = snapshot?.locks.filter(candidate => candidate.versionId === displayVersion.id).at(-1)
    if (lock === undefined) throw new Error(t('lock.generateFirst'))
    const outcome = await reuseIntoVersion(displayVersion, lock.id, workspaceId)
    if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.message}`)
    onChanged()
    return { ok: true, value: outcome.workspace }
  }
  const createVersionWithAdoption = async (request: Parameters<LoomHostPort['createVersion']>[0]): Promise<RemoteResult<VersionRecord>> => {
    const linkedRoot = request.workspaces?.find(workspace => workspace.mode === 'linked')?.rootPath
    if (linkedRoot === undefined) return createVersion(request)
    const outcome = await createVersionAdoptingLinkedDirectory({
      createVersion,
      generateLock,
      deleteVersion,
      reuse: (version, lockId, reusedId) => reuseIntoVersion(version, lockId, reusedId),
      findWorkspace: rootPath => {
        const found = (snapshot?.workspaces ?? []).find(workspace => workspace.cleaned !== true && workspace.mode === 'direct'
          && (workspace.rootPath ?? workspace.path) === rootPath)
        if (found === undefined) return undefined
        const ownerProjectId = found.projectId ?? snapshot?.versions.find(candidate => candidate.id === found.versionId)?.projectId
        return ownerProjectId === request.projectId ? { id: found.id } : undefined
      },
    }, request, linkedRoot)
    if (outcome === undefined) return createVersion(request)
    if (!outcome.ok) {
      const report = failureReport(outcome.code, outcome.message)
      const detail = [report.detail, outcome.rollbackError === undefined ? undefined : `${t('state.error')}: ${outcome.rollbackError}`].filter((line): line is string => line !== undefined).join(' · ')
      throw new Error(detail === '' ? t(report.message) : `${t(report.message)} · ${detail}`)
    }
    onChanged()
    return { ok: true, value: outcome.version }
  }
  const createVersionReusingWorkspace = async (request: Parameters<LoomHostPort['createVersion']>[0], workspaceId: string): Promise<RemoteResult<VersionRecord>> => {
    const outcome = await createVersionReusingWorkspaceRemote({
      createVersion,
      generateLock,
      deleteVersion,
      reuse: (version, lockId, reusedId) => reuseIntoVersion(version, lockId, reusedId),
    }, request, workspaceId)
    if (!outcome.ok) {
      const report = failureReport(outcome.code, outcome.message)
      const detail = [report.detail, outcome.rollbackError === undefined ? undefined : `${t('state.error')}: ${outcome.rollbackError}`].filter((line): line is string => line !== undefined).join(' · ')
      throw new Error(detail === '' ? t(report.message) : `${t(report.message)} · ${detail}`)
    }
    onChanged()
    return { ok: true, value: outcome.version }
  }
  const createTaskWorkspace = async (workspace: WorkspaceCreationInput): Promise<WorkspaceCreateOutcome> => {
    try {
      if (currentVersion === undefined || currentVersionProject === undefined) throw new Error(t('state.error'))
      const result = await prepareAutoWorkspace(currentVersion, currentVersionProject, workspace)
      return result.ok ? { ok: true, workspace: result.value } : { ok: false, error: failureReport(result.error.code, result.error.message) }
    } catch (error) {
      return { ok: false, error: failureReport('unknown', error instanceof Error ? error.message : String(error)) }
    }
  }
  const registerTaskDirectory = async (path: string): Promise<WorkspaceCreateOutcome> => {
    try {
      if (currentVersion === undefined || currentVersionProject === undefined) throw new Error(t('state.error'))
      const lock = snapshot?.locks.filter(candidate => candidate.versionId === currentVersion.id).at(-1)
      if (lock === undefined) throw new Error(t('lock.generateFirst'))
      const outcome = await registerDirectoryWorkspace({ inspectWorkspace, registerWorkspace, repositoryBranches }, { path, versionId: currentVersion.id, lockId: lock.id, project: currentVersionProject })
      if (outcome.ok) onChanged()
      return outcome
    } catch (error) {
      return { ok: false, error: failureReport('unknown', error instanceof Error ? error.message : String(error)) }
    }
  }
  const renameVersionWorkspace = async (workspaceId: string, label: string): Promise<RemoteResult<WorkspaceRecord>> => {
    const result = await updateWorkspace({ workspaceId, label })
    if (result.ok) onChanged()
    return result
  }
  const removeVersionWorkspace = async (workspaceId: string, deleteFiles = false, confirmPath?: string): Promise<RemoteResult<void>> => {
    const result = deleteFiles
      ? await deleteWorkspace({ workspaceId, deleteFiles: true, ...(confirmPath === undefined ? {} : { confirmPath }) })
      : await cleanupWorkspace({ workspaceId, discardChanges: true })
    if (result.ok) onChanged()
    return result
  }
  return {
    addVersionWorkspace,
    reuseVersionWorkspace,
    createVersionWithAdoption,
    createVersionReusingWorkspace,
    createTaskWorkspace,
    registerTaskDirectory,
    renameVersionWorkspace,
    removeVersionWorkspace,
  }
}
