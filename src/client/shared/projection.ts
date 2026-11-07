/** Catalog projections for the Loom shell; pure functions with no Host runtime imports. */
import type { CatalogSnapshot, ExecutionState, Lock, ProjectRecord, TaskPriority, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import type { TaskStatus } from '../../domain/task.ts'
import type { LoomKey } from './locales.ts'
import type { BoardColumn, BoardTask } from '../features/board/board.ts'
import { projectBoard } from '../features/board/board.ts'

/** Board filter over task title, project, version, status, priority and module. */
export interface ShellFilter {
  readonly projectId?: ProjectRecord['id']
  readonly versionId?: VersionRecord['id']
  readonly priority?: TaskPriority
  readonly moduleId?: string
  readonly search?: string
  /** Business status; coexists with the metadata filters. */
  readonly status?: TaskStatus
}

/** One project lane with its version labels and business-state columns. */
export interface ProjectLane {
  readonly project: ProjectRecord
  readonly versions: readonly VersionRecord[]
  readonly columns: readonly BoardColumn[]
  readonly count: number
}

/** Counters rendered by the kanban metrics strip and context panel. */
export interface BoardMetrics {
  readonly cards: number
  readonly running: number
  readonly review: number
  readonly completed: number
  readonly activeSessions: number
}

/** One native Session row shown in the Loom task sidebar. */
export interface RecentSession {
  readonly id: string
  readonly title: string
  readonly cwd?: string
  readonly updatedAt: number
  readonly running: boolean
}

/** Minimal native Session list row consumed by the Loom task sidebar. */
export interface RecentSessionInput {
  readonly id: string
  readonly displayTitle: string
  readonly cwd?: string
  readonly updatedAt: number
  readonly running: boolean
  /** Empty sessions add noise; the sidebar lists only started conversations. */
  readonly blank?: boolean
  /** Subagent Sessions are not user workbench conversations. */
  readonly origin?: 'subagent'
}

/** One running or attached Session with its owning task context. */
export interface ActiveSession {
  readonly task: TaskRecord
  readonly projectId: ProjectRecord['id']
  readonly versionId: VersionRecord['id']
  readonly sessionId: string
}

function matchProject(projectId: ProjectRecord['id'], filter: ShellFilter): boolean {
  return filter.projectId === undefined || projectId === filter.projectId
}

function matchingRecords(snapshot: CatalogSnapshot, filter: ShellFilter): TaskRecord[] {
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  return snapshot.tasks.filter((task) => {
    const version = versions.get(task.versionId)
    if (version === undefined) return false
    if (!matchProject(version.projectId, filter)) return false
    if (filter.versionId !== undefined && task.versionId !== filter.versionId) return false
    if (filter.status !== undefined && task.status !== filter.status) return false
    if (filter.priority !== undefined && (task.priority ?? 'normal') !== filter.priority) return false
    if (filter.moduleId !== undefined && !(task.moduleIds ?? []).some(moduleId => moduleId === filter.moduleId)) return false
    const query = filter.search?.trim().toLowerCase() ?? ''
    return query === '' || `${task.title}\n${task.description ?? ''}`.toLowerCase().includes(query)
  })
}

function matchingTasks(snapshot: CatalogSnapshot, filter: ShellFilter): BoardTask[] {
  return matchingRecords(snapshot, filter)
}

/** Group matching tasks by project for the kanban swimlanes.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project, version and title constraints.
 * @returns every project lane that has a version, with empty columns retained.
 */
export function projectLanes(snapshot: CatalogSnapshot, filter: ShellFilter): ProjectLane[] {
  const selected = snapshot.projects.filter(project => matchProject(project.id, filter))
  const tasks = matchingTasks(snapshot, filter)
  return selected.map((project) => {
    const versions = snapshot.versions.filter(version => version.projectId === project.id)
    const versionIds = new Set(versions.map(version => version.id))
    const laneTasks = tasks.filter(task => versionIds.has(task.versionId))
    const columns = projectBoard(laneTasks, filter.search === undefined ? {} : { search: filter.search })
    return { project, versions, columns, count: laneTasks.length }
  })
}

/** Project matching tasks into one flat five-column board.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project, version and title constraints.
 * @returns the five status columns shared by every project.
 */
export function flatBoard(snapshot: CatalogSnapshot, filter: ShellFilter): BoardColumn[] {
  return projectBoard(matchingTasks(snapshot, filter), filter.search === undefined ? {} : { search: filter.search })
}

/** Count the cards and Sessions the shell must show.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project and version constraints for card counters.
 * @returns counters independent of the flat/grouped display mode.
 */
export function boardMetrics(snapshot: CatalogSnapshot, filter: ShellFilter): BoardMetrics {
  const tasks = matchingTasks(snapshot, filter)
  const cards = new Set(tasks.map(task => task.id))
  const sessions = boundSessions(snapshot).filter((session) => {
    const version = snapshot.versions.find(candidate => candidate.id === session.versionId)
    return cards.has(session.task.id) && version !== undefined && matchProject(version.projectId, filter)
      && (filter.versionId === undefined || session.versionId === filter.versionId)
  })
  return {
    cards: tasks.length,
    running: tasks.filter(task => task.status === 'running').length,
    review: tasks.filter(task => task.status === 'review').length,
    completed: tasks.filter(task => task.status === 'completed').length,
    activeSessions: sessions.filter(session => session.task.status === 'running').length,
  }
}

/** One card the board must surface as blocked together with the concrete cause. */
export interface BoardBlocker {
  readonly task: TaskRecord
  readonly reason: LoomKey
}

/** Blocked cards grouped by what the board is waiting for. */
export interface BoardBlockerGroups {
  /** Human acceptance decisions, including unconfirmed Agent suggestions. */
  readonly approval: readonly BoardBlocker[]
  /** Preparation or execution-access waits on the card's workspace. */
  readonly workspace: readonly BoardBlocker[]
  /** Takeovers whose stop outcome is unknown or failed. */
  readonly takeover: readonly BoardBlocker[]
  /** Incomplete cleanup of a workspace the card uses. */
  readonly other: readonly BoardBlocker[]
}

/**
 * Project the cards that cannot move forward onto the four blocker groups the
 * board's overview panel explains. A card is listed at most once per group, and
 * a card can appear in more than one group when it has more than one blocker.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project, version, status and metadata constraints.
 * @returns blocked cards with the localized reason they wait on.
 */
export function boardBlockers(snapshot: CatalogSnapshot, filter: ShellFilter): BoardBlockerGroups {
  const tasks = matchingRecords(snapshot, filter)
  const executionByWorkspace = new Map(snapshot.executions.map(execution => [String(execution.workspaceId), execution]))
  const workspaceById = new Map(snapshot.workspaces.map(workspace => [String(workspace.id), workspace]))
  const approval: BoardBlocker[] = []
  const workspace: BoardBlocker[] = []
  const takeover: BoardBlocker[] = []
  const other: BoardBlocker[] = []
  for (const task of tasks) {
    const attempt = task.attempts.at(-1)
    const record = attempt === undefined ? undefined : workspaceById.get(String(attempt.workspaceId))
    const execution = attempt === undefined ? undefined : executionByWorkspace.get(String(attempt.workspaceId))
    if (task.status === 'review') approval.push({ task, reason: task.outcome?.state === 'suggested' ? 'kb.blockedBySuggestion' : 'kb.blockedByApproval' })
    const preparation = record?.preparation
    if (preparation !== undefined && preparation.status !== 'ready') {
      workspace.push({ task, reason: preparation.status === 'failed' ? 'kb.blockedByPrepareFailed' : 'kb.blockedByPreparing' })
    } else if (execution !== undefined && execution.waiting.length > 0) {
      workspace.push({ task, reason: 'kb.blockedByWaitingExecution' })
    }
    if (execution?.takeover != null && execution.takeover.stopStatus !== 'requested') takeover.push({ task, reason: 'kb.blockedByTakeover' })
    if (record?.cleanup?.status === 'partial') other.push({ task, reason: 'kb.blockedByCleanup' })
  }
  return { approval, workspace, takeover, other }
}

/** List every Session attached to a task attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @returns one row per attached Session, in task and attempt order.
 */
export function boundSessions(snapshot: CatalogSnapshot): ActiveSession[] {
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  const rows: ActiveSession[] = []
  for (const task of snapshot.tasks) {
    const version = versions.get(task.versionId)
    if (version === undefined) continue
    for (const attempt of task.attempts) for (const sessionId of attempt.sessionIds) rows.push({ task, projectId: version.projectId, versionId: version.id, sessionId })
  }
  return rows
}

/** Last path segment of a workspace path; empty for a missing path.
 * @param cwd - absolute workspace path from the native Session list.
 * @returns the basename used as the workspace label.
 */
export function workspaceName(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const trimmed = cwd.replace(/[\\/]+$/u, '')
  if (trimmed === '') return undefined
  const name = trimmed.split(/[\\/]/u).at(-1)
  return name === undefined || name === '' ? undefined : name
}

function selectRecentSessions(rows: readonly RecentSessionInput[], accept: (row: RecentSessionInput) => boolean, search: string, limit: number): RecentSession[] {
  const query = search.trim().toLowerCase()
  return rows
    .filter(row => accept(row) && row.blank !== true && row.origin !== 'subagent' && (query === '' || row.displayTitle.toLowerCase().includes(query)))
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map(row => ({ id: row.id, title: row.displayTitle, ...(row.cwd === undefined ? {} : { cwd: row.cwd }), updatedAt: row.updatedAt, running: row.running }))
}

/** Most recent Sessions attached to a Loom task, newest first.
 * @param rows - native Session list rows in host order.
 * @param bound - Session ids attached to a Loom task attempt.
 * @param search - case-insensitive title filter.
 * @param limit - maximum rows returned, newest first.
 * @returns at most `limit` bound Sessions; global unbound Sessions are excluded.
 */
export function taskSessionRows(rows: readonly RecentSessionInput[], bound: ReadonlySet<string>, search: string, limit = 5): RecentSession[] {
  return selectRecentSessions(rows, row => bound.has(row.id), search, limit)
}

/** Count distinct workspaces used by a running task.
 * @param snapshot - Authoritative catalog snapshot.
 * @returns distinct running workspace ids.
 */
export function activeWorkspaceCount(snapshot: CatalogSnapshot): number {
  const ids = new Set<string>()
  for (const task of snapshot.tasks) {
    if (task.status !== 'running') continue
    for (const attempt of task.attempts) ids.add(attempt.workspaceId)
  }
  return ids.size
}

/** Resolve the Lock pinned by a task's latest attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @param task - Task whose current baseline is requested.
 * @returns the attempt Lock, or undefined before the first execution.
 */
export function currentLock(snapshot: CatalogSnapshot, task: TaskRecord | undefined): Lock | undefined {
  const attemptLockId = task?.attempts.at(-1)?.lock.id
  const bound = task?.workspaceId === undefined ? undefined : snapshot.workspaces.find(workspace => workspace.id === task.workspaceId)
  const lockId = attemptLockId ?? bound?.lockId
  return lockId === undefined ? undefined : snapshot.locks.find(lock => lock.id === lockId)
}

/** Resolve the workspace used by a task's latest attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @param task - Task whose current workspace is requested.
 * @returns the workspace record, or undefined before the first execution.
 */
export function currentWorkspace(snapshot: CatalogSnapshot, task: TaskRecord | undefined) {
  const workspaceId = task?.attempts.at(-1)?.workspaceId ?? task?.workspaceId
  return workspaceId === undefined ? undefined : snapshot.workspaces.find(workspace => workspace.id === workspaceId)
}

/** Resolve workspace execution scheduling for a task's latest attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @param task - Task whose workspace is requested.
 * @returns the persisted execution state, or undefined before the first execution.
 */
export function currentExecution(snapshot: CatalogSnapshot, task: TaskRecord | undefined): ExecutionState | undefined {
  const workspaceId = task?.attempts.at(-1)?.workspaceId ?? task?.workspaceId
  return workspaceId === undefined ? undefined : snapshot.executions.find(execution => execution.workspaceId === workspaceId)
}

/** Native Session attached most recently to a task's current attempt.
 * @param task - Task whose current Session is requested.
 * @returns the newest attached Session id, or undefined before any association.
 */
export function boundSessionId(task: TaskRecord | undefined): string | undefined {
  return task?.attempts.at(-1)?.sessionIds.at(-1)
}

/** Provider-reported token buckets from the native token-meter projection. */
export interface TokenUsageView {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

function isTokenUsage(value: unknown): value is TokenUsageView {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.uncachedInputTokens === 'number' && typeof record.outputTokens === 'number'
    && typeof record.cacheReadTokens === 'number' && typeof record.cacheWriteTokens === 'number'
}

/**
 * Read the token-meter projection from an opaque projection-values object.
 * @param values - one Session's projected values, when loaded.
 * @returns admitted usage buckets, or undefined when the plugin reported none.
 */
export function tokenUsageOf(values: object | undefined): TokenUsageView | undefined {
  if (values === undefined) return undefined
  const candidate = Reflect.get(values, 'tokenUsage')
  return isTokenUsage(candidate) ? candidate : undefined
}

/**
 * Sum token usage across the Sessions bound to one task.
 * @param values - projection values for each bound Session.
 * @returns cumulative buckets, or undefined when no Session reported usage.
 */
export function aggregateTokenUsage(values: readonly (object | undefined)[]): TokenUsageView | undefined {
  let total: TokenUsageView | undefined
  for (const value of values) {
    const usage = tokenUsageOf(value)
    if (usage === undefined) continue
    total = total === undefined ? usage : {
      uncachedInputTokens: total.uncachedInputTokens + usage.uncachedInputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + usage.cacheWriteTokens,
    }
  }
  return total
}

/** Native Session state the workbench needs without importing the native store type. */
export interface AttemptSessionLookup {
  (sessionId: string): { readonly running: boolean; readonly displayTitle?: string; readonly updatedAt?: number } | undefined
}

/** Why an attached Session cannot be opened, for a localized reason line. */
export type SessionUnavailableReason = 'missing' | 'failed'

/** One attached Session under an execution round. */
export interface AttemptSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly updatedAt?: number
  readonly running: boolean
  readonly available: boolean
  readonly unavailableReason?: SessionUnavailableReason
}

/** One execution round with every Session attached to it. */
export interface TaskAttemptRow {
  readonly attemptId: string
  readonly round: number
  readonly latest: boolean
  readonly status: Exclude<TaskRecord['status'], 'pending'>
  readonly lock: Lock
  readonly workspaceId: string
  readonly sessions: readonly AttemptSessionRow[]
}

/**
 * Project every execution round and its Sessions for the task session list.
 * @param task - Task whose append-only round history is shown.
 * @param lookup - Native Session state by id; undefined means the Session is not loaded.
 * @param failed - Sessions whose native retain call failed and may be retried.
 * @returns rounds oldest first, with their Sessions in attach order.
 */
export function taskAttemptRows(task: TaskRecord | undefined, lookup: AttemptSessionLookup, failed: ReadonlySet<string>): TaskAttemptRow[] {
  if (task === undefined) return []
  return task.attempts.map((attempt, index) => ({
    attemptId: attempt.id,
    round: index + 1,
    latest: index === task.attempts.length - 1,
    status: attempt.status,
    lock: attempt.lock,
    workspaceId: attempt.workspaceId,
    sessions: attempt.sessionIds.map((sessionId) => {
      const state = lookup(sessionId)
      const isFailed = failed.has(sessionId)
      return {
        sessionId,
        ...(state?.displayTitle === undefined ? {} : { title: state.displayTitle }),
        ...(state?.updatedAt === undefined ? {} : { updatedAt: state.updatedAt }),
        running: state?.running === true,
        available: state !== undefined && !isFailed,
        ...(state === undefined ? { unavailableReason: 'missing' as const } : isFailed ? { unavailableReason: 'failed' as const } : {}),
      }
    }),
  }))
}

/** One repository row of a version: current ref and the commit the latest Lock pinned. */
export interface VersionRepositoryRow {
  readonly sourceId: string
  readonly path: string
  readonly repo: string
  readonly ref: string
  readonly commit?: string
}

/**
 * Pair each project repository with the version ref and latest Lock commit.
 * @param project - Project owning the version, when resolved.
 * @param version - Version whose refs are shown.
 * @param latestLock - Newest Lock of the version; commits are absent before one exists.
 * @returns one row per configured repository, in project order.
 */
export function versionRepositoryRows(project: ProjectRecord | undefined, version: VersionRecord | undefined, latestLock: Lock | undefined): VersionRepositoryRow[] {
  if (project === undefined || version === undefined) return []
  const commitBySource = new Map((latestLock?.repositories ?? []).map(repository => [repository.sourceId, repository.commit]))
  return project.config.sources.map((source) => {
    const commit = commitBySource.get(source.id)
    return {
      sourceId: source.id,
      path: source.path,
      repo: source.repo,
      ref: version.sources.find(entry => entry.sourceId === source.id)?.ref ?? '',
      ...(commit === undefined ? {} : { commit }),
    }
  })
}

/** Locks of one version in catalog order, oldest first. */
export function versionLocks(snapshot: CatalogSnapshot, versionId: VersionRecord['id'] | undefined): Lock[] {
  if (versionId === undefined) return []
  return snapshot.locks.filter(lock => lock.versionId === versionId)
}

/** Tasks whose current or historical attempt is pinned to one Lock. */
export function lockTasks(snapshot: CatalogSnapshot, lockId: string): TaskRecord[] {
  return snapshot.tasks.filter(task => task.attempts.some(attempt => attempt.lock.id === lockId))
}

/** Unclean workspaces still baselined on one Lock. */
export function lockWorkspaces(snapshot: CatalogSnapshot, lockId: string): readonly WorkspaceRecord[] {
  return snapshot.workspaces.filter(workspace => workspace.cleaned !== true && workspace.lockId === lockId)
}

/** One task attempt that lives in a workspace. */
export interface WorkspaceTaskLink {
  readonly task: TaskRecord
  readonly attemptId: string
  readonly latest: boolean
}

/** One workspace with its baseline, owning tasks and execution scheduling. */
export interface VersionWorkspaceRow {
  readonly workspace: WorkspaceRecord
  readonly lock?: Lock
  readonly tasks: readonly WorkspaceTaskLink[]
  readonly ownerSessionId?: string
  readonly waiting: number
  readonly takeover: boolean
}

/**
 * Workspaces touched by a version: its own prepared workspaces plus any reused by its tasks.
 * @param snapshot - Authoritative catalog snapshot.
 * @param versionId - Version whose workspaces are listed.
 * @returns unclean workspaces first, then cleaned history, in catalog order.
 */
export function versionWorkspaceRows(snapshot: CatalogSnapshot, versionId: VersionRecord['id'] | undefined): VersionWorkspaceRow[] {
  if (versionId === undefined) return []
  const versionTasks = snapshot.tasks.filter(task => task.versionId === versionId)
  const usedIds = new Set<string>()
  for (const task of versionTasks) for (const attempt of task.attempts) usedIds.add(attempt.workspaceId)
  const rows: VersionWorkspaceRow[] = []
  for (const workspace of snapshot.workspaces) {
    if (workspace.versionId !== versionId && !usedIds.has(workspace.id)) continue
    const execution = snapshot.executions.find(candidate => candidate.workspaceId === workspace.id)
    const tasks: WorkspaceTaskLink[] = []
    for (const task of versionTasks) {
      task.attempts.forEach((attempt, index) => {
        if (attempt.workspaceId === workspace.id) tasks.push({ task, attemptId: attempt.id, latest: index === task.attempts.length - 1 })
      })
    }
    const lock = snapshot.locks.find(candidate => candidate.id === workspace.lockId)
    rows.push({
      workspace,
      ...(lock === undefined ? {} : { lock }),
      tasks,
      ...(execution?.owner === null || execution?.owner === undefined ? {} : { ownerSessionId: execution.owner.sessionId }),
      waiting: execution?.waiting.length ?? 0,
      takeover: execution?.takeover !== null && execution?.takeover !== undefined,
    })
  }
  return [...rows.filter(row => row.workspace.cleaned !== true), ...rows.filter(row => row.workspace.cleaned === true)]
}

/** One occupied or queued workspace of a version, for the version-context panel. */
export interface VersionOccupancyRow {
  readonly workspaceId: string
  readonly workspaceLabel: string
  readonly taskTitles: readonly string[]
  readonly occupied: boolean
  /** Session holding execution access, when one does. */
  readonly ownerSessionId?: string | undefined
  readonly waiting: number
  readonly takeover: boolean
}

/**
 * Real execution occupancy for a version's workspaces.
 * @param snapshot - Authoritative catalog snapshot.
 * @param versionId - Version whose occupancy facts are shown.
 * @returns rows only for workspaces with an owner, waiting Sessions or a pending takeover.
 */
export function versionOccupancy(snapshot: CatalogSnapshot, versionId: VersionRecord['id'] | undefined): VersionOccupancyRow[] {
  if (versionId === undefined) return []
  const rows: VersionOccupancyRow[] = []
  for (const row of versionWorkspaceRows(snapshot, versionId)) {
    const occupied = row.ownerSessionId !== undefined
    if (!occupied && row.waiting === 0 && !row.takeover) continue
    rows.push({
      workspaceId: row.workspace.id,
      workspaceLabel: workspaceName(row.workspace.rootPath ?? row.workspace.path) ?? row.workspace.path,
      taskTitles: [...new Set(row.tasks.map(link => link.task.title))],
      occupied,
      ...(row.ownerSessionId === undefined ? {} : { ownerSessionId: row.ownerSessionId }),
      waiting: row.waiting,
      takeover: row.takeover,
    })
  }
  return rows
}
