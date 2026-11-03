/**
 * Zod request schemas for Loom Remote methods.
 *
 * The schemas validate transport input only; catalog operations perform the
 * cross-record checks.
 */
import { z } from 'zod'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../../shared/version-context.ts'

export const nonempty = z.string().trim().min(1)
export const versionDescription = z.string().max(VERSION_DESCRIPTION_MAX_CHARS).optional()
export const versionTarget = z.strictObject({ subProjectId: nonempty, sourceId: nonempty, ref: nonempty })
export const versionWorkspaceInput = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('auto'), parentPath: nonempty, name: nonempty, branchPrefix: nonempty.optional() }),
  z.strictObject({ mode: z.literal('linked'), rootPath: nonempty, repositories: z.array(z.strictObject({ sourceId: nonempty, targetPath: nonempty })).min(1) }),
])
export const versionRequest = z.strictObject({ projectId: nonempty, name: nonempty, description: versionDescription, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1), targets: z.array(versionTarget).min(1).optional(), workspaces: z.array(versionWorkspaceInput).min(1).optional() })
export const updateProjectRequest = z.strictObject({ projectId: nonempty, config: z.unknown() })
export const updateVersionRequest = z.strictObject({ versionId: nonempty, name: nonempty, description: versionDescription, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1), targets: z.array(versionTarget).min(1).optional() })
export const taskRequest = z.strictObject({ versionId: nonempty, workspaceId: nonempty.optional(), title: nonempty, description: z.string().max(4000).optional(), moduleIds: z.array(nonempty).max(50).optional(), priority: z.enum(['low', 'normal', 'high']).optional() })
export const updateTaskRequest = z.strictObject({ taskId: nonempty, title: nonempty, description: z.string().max(4000).optional(), moduleIds: z.array(nonempty).max(50).optional(), priority: z.enum(['low', 'normal', 'high']).optional() })
export const deleteProjectRequest = z.strictObject({ projectId: nonempty })
export const deleteVersionRequest = z.strictObject({ versionId: nonempty })
export const deleteTaskRequest = z.strictObject({ taskId: nonempty })
export const lockRequest = z.strictObject({ versionId: nonempty })
export const workspaceRepositoryInput = z.strictObject({ sourceId: nonempty, path: nonempty, targetPath: nonempty })
export const workspaceRequest = z.strictObject({ path: nonempty.optional(), versionId: nonempty, lockId: nonempty, branches: z.record(z.string(), nonempty).optional(), mode: z.enum(['managed', 'linked']).optional(), repositories: z.array(workspaceRepositoryInput).min(1).optional(), workspaceId: nonempty.optional(), requireBranches: z.boolean().optional() })
export const registerWorkspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty, lockId: nonempty, branches: z.record(z.string(), nonempty).optional(), mode: z.enum(['direct', 'linked']).optional(), projectId: nonempty.optional(), rootPath: nonempty.optional(), rootOwner: z.enum(['loom', 'user']).optional(), repositories: z.array(workspaceRepositoryInput).min(1).optional(), requireBranches: z.boolean().optional() })
export const repositoryBranchesRequest = z.strictObject({ repo: nonempty })
export const inspectWorkspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty })
export const attemptRequest = z.strictObject({ taskId: nonempty, workspaceId: nonempty, allowBusy: z.boolean().optional() })
export const sessionRequest = z.strictObject({ taskId: nonempty, sessionId: nonempty })
export const temporarySessionRequest = z.strictObject({ sessionId: nonempty, workspacePath: nonempty })
export const forgetTemporarySessionRequest = z.strictObject({ sessionId: nonempty })
export const transitionRequest = z.strictObject({ taskId: nonempty, target: z.enum(['pending', 'running', 'review', 'completed', 'failed']), actor: z.enum(['human', 'agent']), basis: z.string().max(2000).optional() })
export const workspaceChangesRequest = z.strictObject({ workspaceId: nonempty, attemptId: nonempty.optional() })
export const commitWorkspaceRequest = z.strictObject({ workspaceId: nonempty, message: z.string().max(500).optional() })
export const updateWorkspaceRequest = z.strictObject({ workspaceId: nonempty, label: z.string().max(80).optional() })
export const deleteWorkspaceRequest = z.strictObject({ workspaceId: nonempty, deleteFiles: z.boolean().optional(), confirmPath: z.string().optional() })
export const cleanupWorkspaceRequest = z.strictObject({ workspaceId: nonempty, discardChanges: z.boolean().optional() })
export const executionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty })
export const reorderExecutionQueueRequest = z.strictObject({ workspaceId: nonempty, sessionIds: z.array(nonempty) })
export const releaseExecutionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty, generation: z.number().int().nonnegative() })

