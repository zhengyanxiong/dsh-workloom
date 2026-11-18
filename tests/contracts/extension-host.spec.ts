import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ControlledApiDefinition,
  ExtensionCapability,
  LoomExtensionActivation,
  LoomExtensionContext,
  LoomExtensionDefinition,
  LoomExtensionId,
  LoomExtensionProfileConfig,
  LoomExtensionTaskConfig,
  LoomSessionId,
  LoomTaskId,
  TaskExtensionPolicy,
} from '../../src/api/extensions.ts'

const extensionId = brandString<LoomExtensionId>('fake.extension')
const taskId = brandString<LoomTaskId>('task-1')
const sessionId = brandString<LoomSessionId>('session-1')

interface FakeConfig {
  readonly endpoint: string
}

const fakeApi: ControlledApiDefinition<{ readonly query: string }, { readonly ok: boolean }> = {
  method: 'fake.query',
  parse(input) {
    if (typeof input !== 'object' || input === null || !('query' in input) || typeof input.query !== 'string') {
      throw new Error('invalid query')
    }
    return { query: input.query }
  },
  handle: async () => ({ ok: true }),
}

const fakeDefinition: LoomExtensionDefinition<FakeConfig> = {
  id: extensionId,
  defaultEnabled: false,
  validateProfileConfig(value) {
    if (typeof value !== 'object' || value === null || !('endpoint' in value) || typeof value.endpoint !== 'string') {
      throw new Error('invalid profile config')
    }
    return { endpoint: value.endpoint }
  },
  activate(context: LoomExtensionContext<FakeConfig>): LoomExtensionActivation {
    const capabilities: readonly ExtensionCapability[] = [
      { kind: 'service', extensionId, serviceId: 'fake.service' },
      { kind: 'tool', extensionId, toolName: 'fake_tool' },
      { kind: 'projection', extensionId, projectionKey: 'fakeProjection' },
      { kind: 'event', extensionId, eventName: 'fake/event' },
      { kind: 'api', extensionId, method: fakeApi.method },
      { kind: 'ui', extensionId, slot: 'conversation.view', viewId: 'fake-view' },
    ]
    capabilities.forEach(capability => { context.registerCapability(capability) })
    context.registerControlledApi(fakeApi)
    return { dispose: () => undefined }
  },
}

const profile: LoomExtensionProfileConfig<FakeConfig> = {
  enabled: true,
  config: { endpoint: 'https://example.test' },
}
const task: LoomExtensionTaskConfig = { enabled: false }

const policy: TaskExtensionPolicy = {
  extensionId,
  taskId,
  enabled: false,
  isEnabled: () => false,
  assertEnabled: () => { throw new Error('disabled') },
}

void fakeDefinition
void profile
void task
void policy
describe('extension capability contracts', () => {
  it('keeps fake extensions type-safe without implementing host behavior', () => {
    expectTypeOf(extensionId).toMatchTypeOf<LoomExtensionId>()
    expectTypeOf(sessionId).toMatchTypeOf<LoomSessionId>()
    expectTypeOf(taskId).toMatchTypeOf<LoomTaskId>()
    expect(policy.isEnabled()).toBe(false)
  })
})
