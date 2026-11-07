/**
 * Public durable catalog records.
 *
 * This module is the public API surface. Host persistence and catalog
 * implementation stay in `src/host`; client code imports these records from
 * `dsh-workloom/types` without depending on Host modules.
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ProjectConfig } from '../domain/project.ts'
import type { VersionTarget } from '../domain/version.ts'
import type { Lock, Task, TaskOutcome, Workspace } from '../domain/task.ts'
import type { WorkspaceMode, WorkspaceRepositoryBinding } from '../domain/workspace.ts'
import type { AuditEntry } from '../domain/audit.ts'
import type { ExecutionState } from '../domain/execution.ts'

export interface ProjectRecord { id: Branded<'loom.project'>; config: ProjectConfig }
/**
 * Named version with fixed project membership, repository refs and an optional description.
 */
export interface VersionRecord {
  id: Branded<'loom.version'>
  projectId: ProjectRecord['id']
  name: string
  /**
   * Human-authored version intent; persisted as a trimmed string, empty when absent.
   */
  description: string
  sources: { sourceId: Branded<'loom.source'>; ref: string }[]
  /**
   * Canonical V2 refs scoped to sub-projects; absent on pre-V2 versions.
   */
  targets?: readonly VersionTarget[] | undefined
}
/**
 * Task scheduling weight shown on the board; it never changes execution rights.
 */
export type TaskPriority = 'low' | 'normal' | 'high'

/**
 * Named task with its fixed version and execution history.
 */
export interface TaskRecord extends Task {
  title: string
  /**
   * Version-bound workspace selected at task creation; a pending or failed task may start on another ready workspace of the same version.
   */
  workspaceId?: WorkspaceRecord['id'] | undefined
  description?: string | undefined
  moduleIds?: readonly Branded<'loom.module'>[] | undefined
  priority?: TaskPriority | undefined
  /**
   * ISO 8601 time of the last Host-side mutation (create, edit, status change,
   * attempt start or Session attachment). Absent on records persisted before
   * this field existed; deterministic ordering falls back to catalog order.
   */
  updatedAt?: string | undefined
  /**
   * Latest Agent suggestion or human confirmation for the current round.
   * Absent on records persisted before structured outcomes existed; an Agent
   * suggestion never means the task is complete.
   */
  outcome?: TaskOutcome | undefined
}
/**
 * Aggregate progress of one multi-repository workspace preparation.
 */
export type WorkspacePreparationStatus = 'waiting' | 'preparing' | 'ready' | 'failed'
/**
 * One repository's preparation step.
 */
export type WorkspacePreparationRepositoryStatus = 'waiting' | 'preparing' | 'done' | 'failed'
/**
 * Per-repository preparation progress, persisted after every step so the UI can poll it.
 */
export interface WorkspacePreparationRepository {
  readonly sourceId: Branded<'loom.source'>
  readonly status: WorkspacePreparationRepositoryStatus
  /**
   * Materialized directory (managed) or link path (linked) once the step finished.
   */
  readonly path?: string | undefined
  /**
   * Git or filesystem diagnostic when the step failed.
   */
  readonly error?: string | undefined
  /**
   * Diagnostics from removing this step's partial resources.
   */
  readonly rollback?: string | undefined
}
/**
 * Stepwise preparation state of one workspace record.
 */
export interface WorkspacePreparation {
  readonly status: WorkspacePreparationStatus
  readonly startedAt?: string | undefined
  readonly updatedAt?: string | undefined
  /**
   * Aggregate failure diagnostic when `status` is `failed`.
   */
  readonly error?: string | undefined
  readonly repositories: readonly WorkspacePreparationRepository[]
}
/**
 * Aggregate progress of one workspace cleanup.
 */
export type WorkspaceCleanupStatus = 'waiting' | 'cleaning' | 'partial' | 'cleaned'
/**
 * One repository's cleanup outcome.
 */
export type WorkspaceCleanupRepositoryStatus = 'waiting' | 'removed' | 'kept' | 'failed'
/**
 * Per-repository cleanup progress; `removed` survives a retry as success.
 */
export interface WorkspaceCleanupRepository {
  readonly sourceId: Branded<'loom.source'>
  readonly status: WorkspaceCleanupRepositoryStatus
  readonly path?: string | undefined
  readonly error?: string | undefined
  /**
   * Path that still exists because this step failed.
   */
  readonly residual?: string | undefined
}
/**
 * Stepwise cleanup state of one workspace record.
 */
export interface WorkspaceCleanup {
  readonly status: WorkspaceCleanupStatus
  readonly startedAt?: string | undefined
  readonly updatedAt?: string | undefined
  /**
   * Aggregate diagnostic when cleanup is `partial`.
   */
  readonly error?: string | undefined
  /**
   * Paths the last attempt could not remove.
   */
  readonly residual?: readonly string[] | undefined
  readonly repositories: readonly WorkspaceCleanupRepository[]
}
/**
 * Already-prepared workspace metadata; a cleaned record keeps its history but no longer owns
 * files.
 */
export interface WorkspaceRecord extends Workspace {
  path: string
  /**
   * Human display label; path remains the immutable execution identity.
   */
  label?: string | undefined
  branches?: Record<string, string> | undefined
  managed?: boolean | undefined
  cleaned?: boolean | undefined
  /**
   * Project-pool fields; absent on records accepted before the layout migration.
   */
  projectId?: Branded<'loom.project'> | undefined
  mode?: WorkspaceMode | undefined
  rootPath?: string | undefined
  rootOwner?: 'loom' | 'user' | undefined
  repositories?: readonly WorkspaceRepositoryBinding[] | undefined
  /**
   * Skill links this workspace added under `<root>/.dsh/skills`; direct-workspace cleanup
   * removes only these.
   */
  skillLinks?: readonly string[] | undefined
  /**
   * Stepwise preparation progress; absent means the record predates progress tracking (treat as
   * ready).
   */
  preparation?: WorkspacePreparation | undefined
  /**
   * Stepwise cleanup progress; absent until a cleanup was attempted.
   */
  cleanup?: WorkspaceCleanup | undefined
}
/**
 * A native Session started from Workloom without a task attachment.
 */
export interface TemporarySessionRecord {
  readonly sessionId: Branded<'SessionId'>
  readonly workspacePath: string
  readonly createdAt: number
}
/**
 * Detached durable catalog snapshot.
 */
export interface CatalogSnapshot { projects: ProjectRecord[]; versions: VersionRecord[]; locks: Lock[]; tasks: TaskRecord[]; workspaces: WorkspaceRecord[]; temporarySessions: TemporarySessionRecord[]; audit: AuditEntry[]; executions: ExecutionState[] }
