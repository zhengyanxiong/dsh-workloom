/**
 * Native Agent tools for reporting a round's outcome to the Loom catalog.
 *
 * The tools are advisory: they may request human review and record real
 * evidence, but only a human Remote transition can complete or fail a task.
 * @module dsh-workloom/host/tools
 */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { findSessionAttempt, type Catalog, type TaskSuggestion } from './catalog.ts'
import type { TaskEvidence, TaskTestResult } from '../domain/task.ts'

/** JSON Schema subset accepted by the native tool registry. */
export interface LoomToolSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  oneOf?: LoomToolSchema[]
  properties?: Record<string, LoomToolSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: LoomToolSchema
  enum?: (string | number | boolean | null)[]
  const?: string | number | boolean | null
  description?: string
  title?: string
}

/** Text content block returned to the model. */
export interface LoomToolText {
  readonly type: 'text'
  readonly text: string
}

/** One tool definition in the native registry's normalized shape. */
export interface LoomToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: LoomToolSchema
  readonly output: {
    readonly schema: LoomToolSchema
    render(args: unknown, value: unknown): readonly LoomToolText[]
  }
  execute(args: unknown, exec: LoomToolRunContext): Promise<unknown>
}

/** Execution identity subset the tools read: the owning Agent's Session. */
export interface LoomToolRunContext {
  readonly agent?: { readonly session: { readonly id: string } } | undefined
}

/** Native tool registry subset the Host registers through. */
export interface LoomToolRegistrar {
  register(definition: LoomToolDefinition): () => void
}

const testResultSchema: LoomToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Short test name or spec title.' },
    status: { type: 'string', enum: ['passed', 'failed', 'skipped'], description: 'Observed result.' },
    command: { type: 'string', description: 'Exact command that produced the result.' },
    detail: { type: 'string', description: 'Failure message or other observed detail.' },
  },
  required: ['name', 'status'],
}

const evidenceProperties: Record<string, LoomToolSchema> = {
  summary: { type: 'string', description: 'What this round actually did, in the Agent’s own words.' },
  completed: { type: 'array', items: { type: 'string' }, description: 'Concrete items finished in this round.' },
  notDone: { type: 'array', items: { type: 'string' }, description: 'Concrete items left undone.' },
  risks: { type: 'array', items: { type: 'string' }, description: 'Known risks or uncertainties.' },
  impact: { type: 'array', items: { type: 'string' }, description: 'Files, modules or behaviors this round affected.' },
  testResults: { type: 'array', items: testResultSchema, description: 'Real executed test results; omit when no tests ran.' },
}

const reviewParameters: LoomToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...evidenceProperties,
    basis: { type: 'string', description: 'Why human review is warranted now.' },
  },
  required: ['summary'],
}

const failureParameters: LoomToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...evidenceProperties,
    reason: { type: 'string', description: 'Why the round cannot complete.' },
  },
  required: ['reason'],
}

const outputSchema: LoomToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string' },
    attemptId: { type: 'string' },
    status: { type: 'string', description: 'Task status after the report.' },
    suggestedStatus: { type: 'string', enum: ['review', 'failed'] },
  },
  required: ['taskId', 'attemptId', 'status', 'suggestedStatus'],
}

/** Read one optional string list, rejecting malformed entries instead of fabricating evidence. */
function readList(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings`)
  return value.map(item => {
    if (typeof item !== 'string') throw new Error(`${label} must contain only strings`)
    return item
  })
}

/** Read optional real test results; never invent a placeholder result. */
function readTestResults(value: unknown): readonly TaskTestResult[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('testResults must be an array')
  return value.map(item => {
    if (typeof item !== 'object' || item === null) throw new Error('each test result must be an object')
    const record = item as Record<string, unknown>
    if (typeof record.name !== 'string' || record.name.trim() === '') throw new Error('each test result needs a non-empty name')
    if (record.status !== 'passed' && record.status !== 'failed' && record.status !== 'skipped') throw new Error('each test result status must be passed, failed or skipped')
    return {
      name: record.name,
      status: record.status,
      ...(typeof record.command === 'string' ? { command: record.command } : {}),
      ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
    }
  })
}

/** Read an optional string; an empty value stays absent. */
function readText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

/** Read the model-supplied argument object, rejecting a non-object payload. */
function readArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('tool arguments must be an object')
  return value as Record<string, unknown>
}

/** Translate tool arguments into the catalog's evidence shape. */
function readEvidence(args: Record<string, unknown>): TaskEvidence {
  const summary = readText(args.summary, 'summary')
  const completed = readList(args.completed, 'completed')
  const notDone = readList(args.notDone, 'notDone')
  const risks = readList(args.risks, 'risks')
  const impact = readList(args.impact, 'impact')
  const testResults = readTestResults(args.testResults)
  return {
    ...(summary === undefined ? {} : { agentSummary: summary }),
    ...(completed === undefined ? {} : { completed }),
    ...(notDone === undefined ? {} : { notDone }),
    ...(risks === undefined ? {} : { risks }),
    ...(impact === undefined ? {} : { impact }),
    ...(testResults === undefined ? {} : { testResults }),
  }
}

/**
 * Record one suggestion through the catalog after resolving the calling Session's
 * current round; a Session without a live round is rejected instead of guessing.
 */
async function report(
  catalog: Catalog,
  exec: LoomToolRunContext,
  build: () => Omit<TaskSuggestion, 'sessionId'>,
): Promise<{ taskId: string; attemptId: string; status: string; suggestedStatus: 'review' | 'failed' }> {
  const session = exec.agent?.session
  if (session === undefined || session.id === '') throw new Error('this Loom tool requires an owning Agent session')
  const sessionId = brandString<Branded<'SessionId'>>(session.id)
  const binding = findSessionAttempt(catalog.snapshot(), sessionId)
  if (binding === undefined) throw new Error('this Session is not attached to a Loom task round; nothing was recorded')
  const suggestion = build()
  const task = await catalog.suggestTaskOutcome(binding.task.id, { ...suggestion, sessionId })
  const attempt = task.attempts.at(-1)
  return {
    taskId: task.id,
    attemptId: attempt?.id ?? binding.attempt.id,
    status: task.status,
    suggestedStatus: suggestion.suggestedStatus,
  }
}

/** Render one accepted report without claiming human confirmation. */
function describeReport(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Recorded the Loom round report; a human still decides the final status.'
  const record = value as Record<string, unknown>
  const taskId = typeof record.taskId === 'string' ? record.taskId : 'the task'
  const status = typeof record.status === 'string' ? record.status : 'unknown'
  if (record.suggestedStatus === 'review') {
    return `Recorded the review request for ${taskId}. The task is now "${status}"; a human must accept or reject it in the Loom task view.`
  }
  return `Recorded the failure suggestion for ${taskId}. The task remains "${status}"; a human must confirm the failure in the Loom task view.`
}

/**
 * Register the Loom Agent tools on one tools registry.
 * @param tools - native registry (or a test double with the same shape).
 * @param catalog - committed catalog the tools report into.
 * @param refresh - optional snapshot refresh invoked after a successful write.
 * @returns a disposer that unregisters every tool it registered.
 */
export function registerLoomAgentTools(tools: LoomToolRegistrar, catalog: Catalog, refresh?: () => void): () => void {
  const disposers: (() => void)[] = []
  disposers.push(tools.register({
    name: 'loom_request_review',
    description: 'Report the current Loom round for human acceptance review. Records your summary, real test results and remaining work; it never completes or fails the task — a human decides that in the Loom task view.',
    parameters: reviewParameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: describeReport(value) }],
    },
    execute: async (raw, exec) => {
      const args = readArguments(raw)
      const summary = args.summary
      if (typeof summary !== 'string' || summary.trim() === '') throw new Error('summary is required so the reviewer sees what this round did')
      if (summary.trim().length > 4000) throw new Error('summary is too long')
      const evidence = readEvidence(args)
      const basis = readText(args.basis, 'basis')
      const result = await report(catalog, exec, () => ({
        suggestedStatus: 'review',
        ...evidence,
        ...(basis === undefined || basis.trim() === '' ? {} : { basis }),
      }))
      refresh?.()
      return result
    },
  }))
  disposers.push(tools.register({
    name: 'loom_report_failure',
    description: 'Record that the current Loom round cannot complete, with the concrete reason and what remains. This only records your suggestion; the task stays running and a human must confirm the failure.',
    parameters: failureParameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: describeReport(value) }],
    },
    execute: async (raw, exec) => {
      const args = readArguments(raw)
      const reason = args.reason
      if (typeof reason !== 'string' || reason.trim() === '') throw new Error('reason is required so the failure is explainable')
      if (reason.trim().length > 2000) throw new Error('reason is too long')
      const evidence = readEvidence(args)
      const result = await report(catalog, exec, () => ({ suggestedStatus: 'failed', ...evidence, basis: reason }))
      refresh?.()
      return result
    },
  }))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
