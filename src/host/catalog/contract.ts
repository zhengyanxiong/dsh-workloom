/**
 * Host catalog contract consumed by the Remote service and its tests.
 *
 * These are type-level operations only; the implementation remains in
 * `catalog.ts`.
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ProjectConfig } from '../../domain/project.ts'
import type { Lock, TaskEvidence, TaskStatus } from '../../domain/task.ts'
import type { VersionTarget } from '../../domain/version.ts'
import type { ExecutionOwner, ExecutionState, StopOutcome } from '../../domain/execution.ts'
import type { WorkspaceMode, WorkspaceRepositoryBinding } from '../../domain/workspace.ts'
import type { WorkspaceRepositoryChanges } from '../../git/workspace.ts'
import type { CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceRecord } from '../../api/records.ts'

/**
 * A Session's advisory completion report; only a human transition confirms it.
 */
export interface TaskSuggestion extends TaskEvidence {
  /**
   * Session whose Agent produced the report.
   */
  readonly sessionId: Branded<'SessionId'>
  /**
   * `review` asks for human review; `failed` suggests the round cannot complete.
   */
  readonly suggestedStatus: 'review' | 'failed'
  /**
   * Stated reason for the suggestion.
   */
  readonly basis?: string | undefined
}
/**
 * Human metadata supplied with a terminal transition that decides a suggestion.
 */
export interface TaskConfirmation {
  /**
   * Human rationale recorded with the confirmation decision.
   */
  readonly basis?: string | undefined
}
/**
 * One repository checkpoint created by a workspace commit.
 */
export interface WorkspaceCommitRepository {
  readonly sourceId: Branded<'loom.source'>
  readonly path: string
  readonly changed: boolean
  readonly commit?: string
  readonly error?: string
}
/**
 * Per-repository checkpoint result for a workspace commit.
 */
export interface WorkspaceCommitResult {
  readonly repositories: readonly WorkspaceCommitRepository[]
  readonly committed: number
}
export interface WorkspaceStatusRepository extends WorkspaceRepositoryChanges {
  /**
   * Commits HEAD has that its upstream does not; absent when no upstream is configured.
   */
  readonly unpushed?: number | undefined
  /**
   * True when the branch has no upstream, so no ahead count exists.
   */
  readonly unpushedUnavailable?: boolean | undefined
}
/**
 * Prepare a managed or linked workspace from one version Lock.
 */
export interface PrepareWorkspaceInput {
  readonly path: string
  readonly versionId: Lock['versionId']
  readonly lockId: Lock['id']
  readonly branches?: Readonly<Record<string, string>>
  readonly mode?: 'managed' | 'linked'
  readonly repositories?: readonly { readonly sourceId: Branded<'loom.source'>; readonly path: string; readonly targetPath: string }[]
  readonly workspaceId?: WorkspaceRecord['id']
  readonly requireBranches?: boolean
}

/**
 * Register an existing directory as a prepared workspace.
 */
export interface RegisterPreparedWorkspaceInput {
  readonly path: string
  readonly versionId: Lock['versionId']
  readonly lockId: Lock['id']
  readonly branches?: Readonly<Record<string, string>>
  readonly projectId?: Branded<'loom.project'>
  readonly mode?: WorkspaceMode
  readonly rootPath?: string
  readonly rootOwner?: 'loom' | 'user'
  readonly repositories?: readonly Omit<WorkspaceRepositoryBinding, 'kind'>[]
}

/**
 * Optional task metadata admitted with the title.
 */
export interface CreateTaskOptions {
  readonly workspaceId?: WorkspaceRecord['id'] | undefined
  readonly description?: string | undefined
  readonly moduleIds?: readonly Branded<'loom.module'>[] | undefined
  readonly priority?: TaskPriority | undefined
}

/**
 * Persistent catalog operations. Writes are committed before snapshots change.
 */
export interface Catalog {
  snapshot(): CatalogSnapshot
  createProject(config: unknown): Promise<ProjectRecord>
  updateProject(projectId: ProjectRecord['id'], config: ProjectConfig): Promise<ProjectRecord>
  deleteProject(projectId: ProjectRecord['id']): Promise<void>
  createVersion(projectId: ProjectRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord>
  updateVersion(versionId: VersionRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord>
  deleteVersion(versionId: VersionRecord['id']): Promise<void>
  generateLock(versionId: VersionRecord['id']): Promise<Lock>
  createTask(versionId: VersionRecord['id'], title: string, options?: CreateTaskOptions): Promise<TaskRecord>
  updateTask(taskId: TaskRecord['id'], title: string, options?: CreateTaskOptions): Promise<TaskRecord>
  deleteTask(taskId: TaskRecord['id']): Promise<void>
  prepareWorkspace(input: PrepareWorkspaceInput): Promise<WorkspaceRecord>
  workspaceChanges(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ repositories: WorkspaceRepositoryChanges[] }>
  workspaceChangeCount(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<number>
  workspaceStatus(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ running: boolean; repositories: WorkspaceStatusRepository[] }>
  /**
   * Commit every repository's uncommitted changes without pushing.
   */
  commitWorkspace(workspaceId: WorkspaceRecord['id'], message: string): Promise<WorkspaceCommitResult>
  workspaceDirty(workspaceId: WorkspaceRecord['id']): Promise<boolean>
  updateWorkspace(workspaceId: WorkspaceRecord['id'], label: string): Promise<WorkspaceRecord>
  deleteWorkspace(workspaceId: WorkspaceRecord['id'], deleteFiles: boolean, confirmPath?: string): Promise<void>
  cleanupWorkspace(workspaceId: WorkspaceRecord['id'], discardChanges: boolean): Promise<void>
  ensureWorkspaceBranches(workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord>
  ensureWorkspaceSkillLinks(workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord>
  registerPreparedWorkspace(input: RegisterPreparedWorkspaceInput): Promise<WorkspaceRecord>
  startAttempt(taskId: TaskRecord['id'], workspaceId: WorkspaceRecord['id'], options?: { readonly allowBusy?: boolean }): Promise<TaskRecord>
  attachSession(taskId: TaskRecord['id'], sessionId: Branded<'SessionId'>): Promise<TaskRecord>
  registerTemporarySession(sessionId: Branded<'SessionId'>, workspacePath: string): Promise<TemporarySessionRecord>
  forgetTemporarySession(sessionId: Branded<'SessionId'>): Promise<void>
  transitionTask(taskId: TaskRecord['id'], target: TaskStatus, actor: 'human' | 'agent', confirmation?: TaskConfirmation): Promise<TaskRecord>
  /**
   * Record one Agent report; a review suggestion may move running→review, never to completed.
   */
  suggestTaskOutcome(taskId: TaskRecord['id'], suggestion: TaskSuggestion): Promise<TaskRecord>
  acquireExecution(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState>
  cancelExecution(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState>
  reorderExecutionQueue(workspaceId: WorkspaceRecord['id'], sessionIds: readonly Branded<'SessionId'>[]): Promise<ExecutionState>
  releaseExecution(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner): Promise<ExecutionState>
  beginTakeover(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<{ state: ExecutionState; owner: ExecutionOwner }>
  finishTakeover(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner, outcome: StopOutcome): Promise<ExecutionState>
  releaseSession(sessionId: Branded<'SessionId'>): Promise<void>
}
