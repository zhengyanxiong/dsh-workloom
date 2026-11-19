import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, expectTypeOf, it } from 'vitest'
import { createFakeApiTestingProvider } from '../../../src/extensions/api-testing/fake-provider.ts'
import {
  ApiTestingProviderError,
  type ApiTestingProvider,
  type ApiTestingRun,
  type ApiTestingRunId,
  type CreateApiTestingRunInput,
} from '../../../src/extensions/api-testing/contract.ts'

const runId = brandString<ApiTestingRunId>('run-1')

it('defines stable API testing DTOs', () => {
  const input: CreateApiTestingRunInput = { caseName: 'smoke' }
  const run: ApiTestingRun = { runId, caseName: input.caseName, status: 'queued', variables: {} }
  expectTypeOf(run.status).toEqualTypeOf<'queued' | 'running' | 'passed' | 'failed'>()
  expect(ApiTestingProviderError).toBeDefined()
  expect(run.caseName).toBe('smoke')
  expectTypeOf<ApiTestingProvider>().toHaveProperty('createRun')
})

it('creates queued runs and retrieves immutable DTOs', async () => {
  const provider = createFakeApiTestingProvider({ autoComplete: false })
  const created = await provider.createRun({ caseName: 'smoke', variables: { region: 'test' } })
  expect(created.status).toBe('queued')
  expect(await provider.getRun(created.runId)).toEqual(created)
})

it('creates passed runs when autoComplete is enabled', async () => {
  const provider = createFakeApiTestingProvider({ autoComplete: true })
  await expect(provider.createRun({ caseName: 'smoke' })).resolves.toMatchObject({ status: 'passed' })
})

it('rejects invalid cases and unknown run ids with structured errors', async () => {
  const provider = createFakeApiTestingProvider({ autoComplete: false })
  await expect(provider.createRun({ caseName: '' })).rejects.toMatchObject({ code: 'invalid_case' })
  await expect(provider.getRun(brandString<ApiTestingRunId>('missing'))).rejects.toBeInstanceOf(ApiTestingProviderError)
})

it('does not share state between provider instances', async () => {
  const first = createFakeApiTestingProvider({ autoComplete: false })
  const second = createFakeApiTestingProvider({ autoComplete: false })
  const run = await first.createRun({ caseName: 'isolated' })
  await expect(second.getRun(run.runId)).rejects.toMatchObject({ code: 'run_not_found' })
})
