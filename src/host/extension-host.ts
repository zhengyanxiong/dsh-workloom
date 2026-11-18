import type {
  ControlledApiDefinition,
  ExtensionCapability,
  LoomExtensionActivation,
  LoomExtensionContext,
  LoomExtensionDefinition,
  LoomExtensionHost,
  LoomExtensionId,
  LoomExtensionProfileConfig,
  LoomExtensionTaskConfig,
  LoomSessionId,
  LoomTaskId,
  TaskExtensionPolicy,
} from '../api/extensions.ts'

/** Structured failure raised by the Loom extension host. */
export class ExtensionHostError extends Error {
  readonly code: ExtensionHostErrorCode

  constructor(code: ExtensionHostErrorCode, message: string) {
    super(message)
    this.name = 'ExtensionHostError'
    this.code = code
  }
}

/** Machine-readable extension-host failure codes. */
export type ExtensionHostErrorCode =
  | 'extension_unavailable'
  | 'session_unbound'
  | 'extension_disabled'
  | 'invalid_config'
  | 'identity_mismatch'
  | 'invalid_input'
  | 'duplicate_contribution'
  | 'host_disposed'

interface Binding {
  readonly taskId: LoomTaskId
  readonly token: symbol
}

interface ApiEntry {
  readonly extensionId: LoomExtensionId
  readonly invoke: (input: unknown) => Promise<unknown>
}

interface ActivationRecord {
  readonly definition: LoomExtensionDefinition<unknown>
  readonly config: unknown
  readonly activation: LoomExtensionActivation
  readonly capabilityDisposers: Array<() => void>
  readonly capabilities: ExtensionCapability[]
  readonly apis: Map<string, ApiEntry>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const hasOnlyEnabled = (value: LoomExtensionTaskConfig): boolean => {
  if (!isRecord(value)) return false
  return Object.keys(value).every(key => key === 'enabled')
}

const validateBoolean = (value: boolean | undefined, label: string): boolean | undefined => {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new ExtensionHostError('invalid_config', `${label} must be a boolean`)
  }
  return value
}

const toApiEntry = <Input, Output>(
  extensionId: LoomExtensionId,
  definition: ControlledApiDefinition<Input, Output>,
): ApiEntry => ({
  extensionId,
  invoke: async input => definition.handle(definition.parse(input)),
})

/** Create an in-memory, DSH-independent Loom extension host. */
export function createLoomExtensionHost(): LoomExtensionHost {
  const definitions = new Map<LoomExtensionId, LoomExtensionDefinition<unknown>>()
  const activations = new Map<LoomExtensionId, ActivationRecord>()
  const bindings = new Map<LoomSessionId, Binding>()
  const policies = new Map<string, TaskExtensionPolicy>()
  let disposed = false

  const ensureOpen = (): void => {
    if (disposed) throw new ExtensionHostError('host_disposed', 'extension host is disposed')
  }

  const getDefinition = (extensionId: LoomExtensionId): LoomExtensionDefinition<unknown> => {
    const definition = definitions.get(extensionId)
    if (definition === undefined) {
      throw new ExtensionHostError('extension_unavailable', `extension is unavailable: ${extensionId}`)
    }
    return definition
  }

  const getBinding = (sessionId: LoomSessionId, taskId?: LoomTaskId): Binding => {
    const binding = bindings.get(sessionId)
    if (binding === undefined) throw new ExtensionHostError('session_unbound', `session is unbound: ${sessionId}`)
    if (taskId !== undefined && taskId !== binding.taskId) {
      throw new ExtensionHostError('identity_mismatch', `task does not own session: ${sessionId}`)
    }
    return binding
  }

  const activate = (extensionId: LoomExtensionId, config: unknown): ActivationRecord => {
    const existing = activations.get(extensionId)
    if (existing !== undefined) return existing
    const definition = getDefinition(extensionId)
    const capabilities: ExtensionCapability[] = []
    const capabilityDisposers: Array<() => void> = []
    const apis = new Map<string, ApiEntry>()
    const context: LoomExtensionContext<unknown> = {
      extensionId,
      config,
      registerCapability(capability) {
        if (capability.extensionId !== extensionId) {
          throw new ExtensionHostError('invalid_config', 'capability extension id does not match activation')
        }
        const key = JSON.stringify(capability)
        if (capabilities.some(item => JSON.stringify(item) === key)) {
          throw new ExtensionHostError('duplicate_contribution', `duplicate capability: ${key}`)
        }
        capabilities.push(capability)
        const disposer = (): void => {
          const index = capabilities.indexOf(capability)
          if (index >= 0) capabilities.splice(index, 1)
        }
        capabilityDisposers.push(disposer)
        return disposer
      },
      registerControlledApi(definition) {
        if (apis.has(definition.method)) {
          throw new ExtensionHostError('duplicate_contribution', `duplicate API method: ${definition.method}`)
        }
        const entry = toApiEntry(extensionId, definition)
        apis.set(definition.method, entry)
        const disposer = (): void => { if (apis.get(definition.method) === entry) apis.delete(definition.method) }
        capabilityDisposers.push(disposer)
        return disposer
      },
    }
    try {
      const activation = definition.activate(context)
      const record: ActivationRecord = { definition, config, activation, capabilityDisposers, capabilities, apis }
      activations.set(extensionId, record)
      return record
    } catch (error) {
      for (const disposer of capabilityDisposers.reverse()) disposer()
      throw error
    }
  }

  const resolvePolicy = (input: {
    readonly sessionId: LoomSessionId
    readonly taskId?: LoomTaskId | undefined
    readonly extensionId: LoomExtensionId
    readonly profile: LoomExtensionProfileConfig<unknown>
    readonly task?: LoomExtensionTaskConfig | undefined
  }): TaskExtensionPolicy => {
    ensureOpen()
    const binding = getBinding(input.sessionId, input.taskId)
    const definition = getDefinition(input.extensionId)
    if (!isRecord(input.profile) || !Object.prototype.hasOwnProperty.call(input.profile, 'config')) {
      throw new ExtensionHostError('invalid_config', 'profile.config is required')
    }
    const profileEnabled = validateBoolean(input.profile.enabled, 'profile.enabled')
    if (input.task !== undefined && !hasOnlyEnabled(input.task)) {
      throw new ExtensionHostError('invalid_config', 'task extension config may only contain enabled')
    }
    const taskEnabled = input.task?.enabled
    validateBoolean(taskEnabled, 'task.enabled')
    const enabled = taskEnabled ?? profileEnabled ?? definition.defaultEnabled
    if (enabled) activate(input.extensionId, definition.validateProfileConfig(input.profile.config))
    const policy: TaskExtensionPolicy = {
      extensionId: input.extensionId,
      taskId: binding.taskId,
      enabled,
      isEnabled: () => enabled,
      assertEnabled: () => {
        if (!enabled) throw new ExtensionHostError('extension_disabled', `extension is disabled: ${input.extensionId}`)
      },
    }
    policies.set(`${input.sessionId}:${input.extensionId}`, policy)
    return policy
  }

  return {
    register(definition) {
      ensureOpen()
      if (definitions.has(definition.id)) throw new ExtensionHostError('duplicate_contribution', `extension is already registered: ${definition.id}`)
      definitions.set(definition.id, definition as LoomExtensionDefinition<unknown>)
      return () => {
        const record = activations.get(definition.id)
        if (record !== undefined) {
          for (const disposer of record.capabilityDisposers.reverse()) disposer()
          void record.activation.dispose()
          activations.delete(definition.id)
        }
        definitions.delete(definition.id)
      }
    },
    bindSession(input) {
      ensureOpen()
      if (bindings.has(input.sessionId)) {
        const existing = bindings.get(input.sessionId)
        if (existing?.taskId !== input.taskId) throw new ExtensionHostError('identity_mismatch', `session is already bound: ${input.sessionId}`)
      }
      bindings.set(input.sessionId, { taskId: input.taskId, token: Symbol(input.sessionId) })
      const token = bindings.get(input.sessionId)!.token
      return () => {
        if (bindings.get(input.sessionId)?.token === token) bindings.delete(input.sessionId)
      }
    },
    resolvePolicy,
    visible(extensionId, sessionId) {
      ensureOpen()
      return policies.get(`${sessionId}:${extensionId}`)?.enabled === true
    },
    filterCapabilities(sessionId, policy) {
      ensureOpen()
      const effective = policy ?? [...policies.entries()].find(([key]) => key.startsWith(`${sessionId}:`))?.[1]
      if (effective === undefined || !effective.enabled) return []
      return [...(activations.get(effective.extensionId)?.capabilities ?? [])]
    },
    async callControlledApi(input) {
      ensureOpen()
      const binding = getBinding(input.sessionId, input.taskId)
      const policy = policies.get(`${input.sessionId}:${input.extensionId}`)
      if (policy === undefined) throw new ExtensionHostError('extension_disabled', `extension is not available: ${input.extensionId}`)
      if (policy.taskId !== binding.taskId) throw new ExtensionHostError('identity_mismatch', `task does not own session: ${input.sessionId}`)
      policy.assertEnabled()
      const entry = activations.get(input.extensionId)?.apis.get(input.method)
      if (entry === undefined) throw new ExtensionHostError('extension_unavailable', `API method is unavailable: ${input.method}`)
      try {
        return await entry.invoke(input.input)
      } catch (error) {
        if (error instanceof ExtensionHostError) throw error
        throw new ExtensionHostError('invalid_input', error instanceof Error ? error.message : 'invalid API input')
      }
    },
    async dispose() {
      if (disposed) return
      disposed = true
      const records = [...activations.values()].reverse()
      activations.clear()
      policies.clear()
      bindings.clear()
      for (const record of records) {
        for (const disposer of record.capabilityDisposers.reverse()) disposer()
        await record.activation.dispose()
      }
      definitions.clear()
    },
  }
}
