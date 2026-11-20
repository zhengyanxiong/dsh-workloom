import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ControlledApiDefinition,
  ExtensionCapability,
  LoomExtensionActivation,
  LoomExtensionContext,
  LoomExtensionDefinition,
  LoomExtensionId,
  LoomExtensionLogger,
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

import { createLoomExtensionHost, ExtensionHostError } from '../../src/host/extension-host.ts'

const createHost = (logger?: LoomExtensionLogger) => createLoomExtensionHost({ logger })


const createFakeDefinition = (onActivate?: (context: LoomExtensionContext<FakeConfig>) => LoomExtensionActivation) => ({
  ...fakeDefinition,
  activate: onActivate ?? fakeDefinition.activate,
})

describe('extension host diagnostics', () => {
  it('emits lifecycle and authorization events without API payloads', async () => {
    const events: Array<{ event: string; [key: string]: unknown }> = []
    const logger: LoomExtensionLogger = {
      debug: event => events.push(event),
      info: event => events.push(event),
      warn: event => events.push(event),
      error: event => events.push(event),
    }
    const host = createHost(logger)
    host.register(fakeDefinition)
    host.bindSession({ sessionId, taskId })
    const resolved = host.resolvePolicy({ sessionId, extensionId, profile, task: { enabled: true } })
    host.filterCapabilities(sessionId, resolved)
    await host.callControlledApi({ sessionId, taskId, extensionId, method: fakeApi.method, input: { query: 'secret-query' } })
    await host.dispose()
    expect(events.map(event => event.event)).toEqual(expect.arrayContaining([
      'extension_registered', 'session_bound', 'extension_policy_resolved',
      'extension_activation_started', 'extension_activation_completed',
      'capabilities_visible', 'controlled_api_completed',
      'extension_host_dispose_started', 'extension_host_dispose_completed',
    ]))
    expect(JSON.stringify(events)).not.toContain('secret-query')
  })
})


describe('extension host policy', () => {
  it('resolves profile defaults and task overrides', () => {
    const host = createHost()
    host.register(fakeDefinition)
    host.bindSession({ sessionId, taskId })

    expect(host.resolvePolicy({ sessionId, extensionId, profile: { enabled: false, config: { endpoint: 'x' } } }).enabled).toBe(false)
    expect(host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { endpoint: 'x' } } }).enabled).toBe(true)
    expect(host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { endpoint: 'x' } }, task: { enabled: false } }).enabled).toBe(false)
  })

  it('rejects invalid task configuration, unknown extensions, invalid booleans, and unbound sessions', () => {
    const host = createHost()
    host.register(fakeDefinition)
    expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { endpoint: 'x' } } })).toThrowError(ExtensionHostError)
    host.bindSession({ sessionId, taskId })
    expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { endpoint: 'x' } }, task: { enabled: 'yes' } })).toThrowError(ExtensionHostError)
    expect(() => host.resolvePolicy({ sessionId, extensionId: brandString<LoomExtensionId>('missing'), profile: { enabled: true, config: { endpoint: 'x' } } })).toThrowError(ExtensionHostError)
    expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { endpoint: 'x' } }, task: { enabled: true, config: { endpoint: 'override' } } })).toThrowError(ExtensionHostError)
  })

  it('keeps a replacement session binding after the old disposer runs', () => {
    const host = createHost()
    host.register(fakeDefinition)
    const first = host.bindSession({ sessionId, taskId })
    const replacement = host.bindSession({ sessionId, taskId })

    first()
    expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { config: { endpoint: 'x' } } })).not.toThrow()

    replacement()
    expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { config: { endpoint: 'x' } } })).toThrowError(ExtensionHostError)
  })

  it('rejects a request identity that disagrees with the trusted session binding', () => {
    const host = createHost()
    host.register(fakeDefinition)
    host.bindSession({ sessionId, taskId })
    expect(() => host.resolvePolicy({ sessionId, taskId: brandString<LoomTaskId>('other'), extensionId, profile: { config: { endpoint: 'x' } } })).toThrowError(ExtensionHostError)
  })
})

describe('extension host activation and contributions', () => {
  it('activates once across enabled tasks and filters contributions by policy', async () => {
    const host = createHost()
    let activations = 0
    let disposals = 0
    host.register(createFakeDefinition(context => {
      activations += 1
      context.registerCapability({ kind: 'tool', extensionId, toolName: 'fake_tool' })
      context.registerCapability({ kind: 'ui', extensionId, slot: 'conversation.view', viewId: 'fake-view' })
      context.registerControlledApi(fakeApi)
      return { dispose: () => { disposals += 1 } }
    }))
    const otherTask = brandString<LoomTaskId>('task-2')
    const otherSession = brandString<LoomSessionId>('session-2')
    host.bindSession({ sessionId, taskId })
    host.bindSession({ sessionId: otherSession, taskId: otherTask })
    host.resolvePolicy({ sessionId, extensionId, profile, task: { enabled: true } })
    host.resolvePolicy({ sessionId: otherSession, extensionId, profile, task: { enabled: true } })
    expect(activations).toBe(1)
    expect(host.filterCapabilities(sessionId)).toHaveLength(2)
    expect(host.filterCapabilities(otherSession)).toHaveLength(2)
    expect(host.visible(extensionId, sessionId)).toBe(true)
    const disabledPolicy = host.resolvePolicy({ sessionId, extensionId, profile, task: { enabled: false } })
    expect(host.filterCapabilities(sessionId, disabledPolicy)).toHaveLength(0)
    await expect(host.callControlledApi({ sessionId, extensionId, method: fakeApi.method, input: { query: 'ok' } })).rejects.toThrowError(ExtensionHostError)
    host.resolvePolicy({ sessionId, extensionId, profile, task: { enabled: true } })
    expect(host.visible(extensionId, sessionId)).toBe(true)
    await expect(host.callControlledApi({ sessionId, extensionId, method: fakeApi.method, input: { query: 'ok' } })).resolves.toEqual({ ok: true })
    await expect(host.callControlledApi({ sessionId, extensionId, method: fakeApi.method, input: { query: 'ok' }, taskId: otherTask })).rejects.toThrowError(ExtensionHostError)
    const disposeBinding = host.bindSession({ sessionId: brandString<LoomSessionId>('session-unbind'), taskId: brandString<LoomTaskId>('task-unbind') })
    host.resolvePolicy({ sessionId: brandString<LoomSessionId>('session-unbind'), extensionId, profile, task: { enabled: true } })
    disposeBinding()
    expect(host.visible(extensionId, brandString<LoomSessionId>('session-unbind'))).toBe(false)
    expect(host.filterCapabilities(brandString<LoomSessionId>('session-unbind'))).toHaveLength(0)
    await host.dispose()
    expect(disposals).toBe(1)
    await host.dispose()
    expect(disposals).toBe(1)
  })
})
void policy
describe('extension capability contracts', () => {
  it('keeps fake extensions type-safe without implementing host behavior', () => {
    expectTypeOf(extensionId).toMatchTypeOf<LoomExtensionId>()
    expectTypeOf(sessionId).toMatchTypeOf<LoomSessionId>()
    expectTypeOf(taskId).toMatchTypeOf<LoomTaskId>()
    expect(policy.isEnabled()).toBe(false)
  })
})
