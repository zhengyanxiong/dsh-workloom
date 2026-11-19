import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it } from 'vitest'
import { createLoomExtensionHost } from '../../../src/host/extension-host.ts'
import { apiTestingExtension } from '../../../src/extensions/api-testing/definition.ts'
import type { LoomExtensionId, LoomSessionId, LoomTaskId } from '../../../src/api/extensions.ts'

const extensionId = brandString<LoomExtensionId>('api-testing')
const sessionId = brandString<LoomSessionId>('session-api')
const taskId = brandString<LoomTaskId>('task-api')

function setup() {
  const host = createLoomExtensionHost()
  host.register(apiTestingExtension)
  host.bindSession({ sessionId, taskId })
  return host
}

it('accepts fake provider config and registers the business capability roster', () => {
  const host = setup()
  const policy = host.resolvePolicy({
    sessionId,
    extensionId,
    profile: { enabled: true, config: { provider: 'fake', autoComplete: false } },
  })
  expect(policy.enabled).toBe(true)
  expect(host.filterCapabilities(sessionId, policy)).toEqual(expect.arrayContaining([
    { kind: 'service', extensionId, serviceId: 'api-testing.service' },
    { kind: 'tool', extensionId, toolName: 'api-testing.run' },
    { kind: 'projection', extensionId, projectionKey: 'api-testing.run-status' },
    { kind: 'api', extensionId, method: 'api-testing.create-run' },
    { kind: 'api', extensionId, method: 'api-testing.get-run' },
  ]))
})

it('rejects unsupported provider config and unknown fields', () => {
  const host = setup()
  expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'ouroboros' } } })).toThrowError(expect.objectContaining({ code: 'invalid_config' }))
  expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake', unexpected: true } } })).toThrowError(expect.objectContaining({ code: 'invalid_config' }))
})
it('creates and reads fake runs through controlled APIs', async () => {
  const host = setup()
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake', autoComplete: false } } })
  const created = await host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.create-run',
    input: { caseName: 'smoke', variables: { env: 'test' } },
  })
  expect(created).toMatchObject({ caseName: 'smoke', status: 'queued' })
  if (typeof created !== 'object' || created === null || !('runId' in created) || typeof created.runId !== 'string') {
    throw new Error('created run has no runId')
  }
  const read = await host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.get-run',
    input: { runId: created.runId },
  })
  expect(read).toEqual(created)
})

it('rejects oversized and identity-shaped API inputs before provider execution', async () => {
  const host = setup()
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake' } } })
  await expect(host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.create-run',
    input: { caseName: 'x'.repeat(201) },
  })).rejects.toMatchObject({ code: 'invalid_input' })
  await expect(host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.get-run',
    input: { runId: '' },
  })).rejects.toMatchObject({ code: 'invalid_input' })
  await expect(host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.get-run',
    input: { runId: 'x'.repeat(201) },
  })).rejects.toMatchObject({ code: 'invalid_input' })
  await expect(host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.create-run',
    input: { caseName: 'smoke', sessionId: 'spoofed' },
  })).rejects.toMatchObject({ code: 'invalid_input' })
})
it('fails closed for disabled policy, malformed input, unbound session, and wrong task identity', async () => {
  const host = setup()
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake' } }, task: { enabled: false } })
  await expect(host.callControlledApi({ sessionId, extensionId, method: 'api-testing.create-run', input: { caseName: 'blocked' } })).rejects.toMatchObject({ code: 'extension_disabled' })
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake' } }, task: { enabled: true } })
  await expect(host.callControlledApi({ sessionId, taskId, extensionId, method: 'api-testing.create-run', input: { caseName: 1 } })).rejects.toMatchObject({ code: 'invalid_input' })
  await expect(host.callControlledApi({ sessionId, taskId: brandString<LoomTaskId>('wrong'), extensionId, method: 'api-testing.create-run', input: { caseName: 'wrong' } })).rejects.toMatchObject({ code: 'identity_mismatch' })
  await expect(host.callControlledApi({ sessionId: brandString<LoomSessionId>('missing'), extensionId, method: 'api-testing.create-run', input: { caseName: 'missing' } })).rejects.toMatchObject({ code: 'session_unbound' })
})

it('rejects a policy belonging to another session when filtering capabilities', () => {
  const host = setup()
  const otherSession = brandString<LoomSessionId>('session-filter-other')
  const otherTask = brandString<LoomTaskId>('task-filter-other')
  host.bindSession({ sessionId: otherSession, taskId: otherTask })
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake' } } })
  const otherPolicy = host.resolvePolicy({ sessionId: otherSession, extensionId, profile: { enabled: true, config: { provider: 'fake' } } })
  expect(() => host.filterCapabilities(sessionId, otherPolicy)).toThrowError(expect.objectContaining({ code: 'identity_mismatch' }))
})
it('activates once across sessions and disposes the bundle', async () => {
  const host = setup()
  const otherSession = brandString<LoomSessionId>('session-api-2')
  const otherTask = brandString<LoomTaskId>('task-api-2')
  host.bindSession({ sessionId: otherSession, taskId: otherTask })
  host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake' } } })
  host.resolvePolicy({ sessionId: otherSession, extensionId, profile: { enabled: true, config: { provider: 'fake' } } })
  expect(host.filterCapabilities(otherSession)).toHaveLength(5)
  await host.dispose()
  await expect(host.callControlledApi({ sessionId, extensionId, method: 'api-testing.get-run', input: { runId: 'gone' } })).rejects.toMatchObject({ code: 'host_disposed' })
})
