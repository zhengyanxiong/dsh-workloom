import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity for an installed Loom extension. */
export type LoomExtensionId = Branded<'loom.extension.id'>

/** Stable identity for a Loom task. */
export type LoomTaskId = Branded<'loom.task.id'>

/** Stable identity for a DSH session bound to a Loom task. */
export type LoomSessionId = Branded<'loom.session.id'>

/** Profile-owned extension settings, including provider configuration. */
export interface LoomExtensionProfileConfig<ProviderConfig> {
  readonly enabled?: boolean | undefined
  readonly config: ProviderConfig
}

/** Task-owned extension settings; tasks may override only availability. */
export interface LoomExtensionTaskConfig {
  readonly enabled?: boolean | undefined
}

/** A disposable set of contributions created by one extension activation. */
export interface LoomExtensionActivation {
  /** Release every contribution created by the activation. */
  dispose(): void | Promise<void>
}

/** A validated, Loom-controlled API method exposed by an extension. */
export interface ControlledApiDefinition<Input, Output> {
  readonly method: string
  readonly parse: (input: unknown) => Input
  readonly handle: (input: Input) => Output | Promise<Output>
}

/** Registration surface provided to an activated extension. */
export interface LoomExtensionContext<ProviderConfig> {
  readonly extensionId: LoomExtensionId
  readonly config: ProviderConfig
  registerCapability(capability: ExtensionCapability): () => void
  registerControlledApi<Input, Output>(definition: ControlledApiDefinition<Input, Output>): () => void
}

/** Description of one declarative contribution owned by an extension. */
export type ExtensionCapability =
  | {
      readonly kind: 'service'
      readonly extensionId: LoomExtensionId
      readonly serviceId: string
    }
  | {
      readonly kind: 'tool'
      readonly extensionId: LoomExtensionId
      readonly toolName: string
    }
  | {
      readonly kind: 'projection'
      readonly extensionId: LoomExtensionId
      readonly projectionKey: string
    }
  | {
      readonly kind: 'event'
      readonly extensionId: LoomExtensionId
      readonly eventName: string
    }
  | {
      readonly kind: 'api'
      readonly extensionId: LoomExtensionId
      readonly method: string
    }
  | {
      readonly kind: 'ui'
      readonly extensionId: LoomExtensionId
      readonly slot: 'conversation.view' | 'tool.call.toolview' | 'panel'
      readonly viewId: string
    }

/** Declares an extension and the profile configuration it accepts. */
export interface LoomExtensionDefinition<ProviderConfig> {
  readonly id: LoomExtensionId
  readonly defaultEnabled: boolean
  readonly validateProfileConfig: (value: unknown) => ProviderConfig
  readonly activate: (
    context: LoomExtensionContext<ProviderConfig>,
  ) => LoomExtensionActivation
}

/** Authorization decision for one extension in one trusted task binding. */
export interface TaskExtensionPolicy {
  readonly extensionId: LoomExtensionId
  readonly taskId: LoomTaskId
  readonly enabled: boolean
  isEnabled(): boolean
  assertEnabled(): void
}

/** Public API for registering and resolving Loom extension contracts. */
export interface LoomExtensionHost {
  register<ProviderConfig>(definition: LoomExtensionDefinition<ProviderConfig>): () => void
  bindSession(input: {
    readonly sessionId: LoomSessionId
    readonly taskId: LoomTaskId
  }): () => void
  resolvePolicy(input: {
    readonly sessionId: LoomSessionId
    readonly extensionId: LoomExtensionId
    readonly profile: LoomExtensionProfileConfig<unknown>
    readonly task?: LoomExtensionTaskConfig | undefined
  }): TaskExtensionPolicy
  visible(extensionId: LoomExtensionId, sessionId: LoomSessionId): boolean
  dispose(): Promise<void>
}
