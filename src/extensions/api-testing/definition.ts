import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  ControlledApiDefinition,
  ExtensionCapability,
  LoomExtensionActivation,
  LoomExtensionContext,
  LoomExtensionDefinition,
  LoomExtensionId,
} from '../../api/extensions.ts'
import {
  type ApiTestingProvider,
  type ApiTestingRunId,
  type CreateApiTestingRunInput,
} from './contract.ts'
import { createFakeApiTestingProvider } from './fake-provider.ts'

export interface ApiTestingProfileConfig {
  readonly provider: 'fake'
  readonly autoComplete?: boolean | undefined
}

const extensionId = brandString<LoomExtensionId>('api-testing')
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const invalid = (message: string): Error => new Error(`api-testing: ${message}`)

export const validateApiTestingProfileConfig = (value: unknown): ApiTestingProfileConfig => {
  if (!isRecord(value)) throw invalid('profile config must be an object')
  const keys = Object.keys(value)
  if (!keys.includes('provider') || keys.some(key => key !== 'provider' && key !== 'autoComplete')) {
    throw invalid('profile config has unknown fields')
  }
  if (value.provider !== 'fake') throw invalid('provider must be fake')
  if (value.autoComplete !== undefined && typeof value.autoComplete !== 'boolean') {
    throw invalid('autoComplete must be a boolean')
  }
  return { provider: 'fake', autoComplete: value.autoComplete }
}

const parseObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw invalid(`${label} must be an object`)
  return value
}

const parseVariables = (value: unknown): Readonly<Record<string, string>> => {
  const variables = parseObject(value, 'variables')
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(variables)) {
    if (typeof entry !== 'string') throw invalid('variables must contain only strings')
    result[key] = entry
  }
  return result
}

const parseCreateRunInput = (value: unknown): CreateApiTestingRunInput => {
  const input = parseObject(value, 'create-run input')
  if (Object.keys(input).some(key => key !== 'caseName' && key !== 'variables')) {
    throw invalid('create-run input has unknown fields')
  }
  if (typeof input.caseName !== 'string') throw invalid('caseName must be a string')
  return {
    caseName: input.caseName,
    variables: input.variables === undefined ? undefined : parseVariables(input.variables),
  }
}

const parseGetRunInput = (value: unknown): { readonly runId: ApiTestingRunId } => {
  const input = parseObject(value, 'get-run input')
  if (Object.keys(input).some(key => key !== 'runId')) throw invalid('get-run input has unknown fields')
  if (typeof input.runId !== 'string') throw invalid('runId must be a string')
  return { runId: brandString<ApiTestingRunId>(input.runId) }
}

const capability = <T extends ExtensionCapability>(value: T): T => value

const createRunApi = (provider: ApiTestingProvider): ControlledApiDefinition<CreateApiTestingRunInput, Awaited<ReturnType<ApiTestingProvider['createRun']>>> => ({
  method: 'api-testing.create-run',
  parse: parseCreateRunInput,
  handle: input => provider.createRun(input),
})

const getRunApi = (provider: ApiTestingProvider): ControlledApiDefinition<{ readonly runId: ApiTestingRunId }, Awaited<ReturnType<ApiTestingProvider['getRun']>>> => ({
  method: 'api-testing.get-run',
  parse: parseGetRunInput,
  handle: input => provider.getRun(input.runId),
})

export const apiTestingExtension: LoomExtensionDefinition<ApiTestingProfileConfig> = {
  id: extensionId,
  defaultEnabled: false,
  validateProfileConfig: validateApiTestingProfileConfig,
  activate(context: LoomExtensionContext<ApiTestingProfileConfig>): LoomExtensionActivation {
    const provider = createFakeApiTestingProvider({ autoComplete: context.config.autoComplete })
    const disposers = [
      context.registerCapability(capability({ kind: 'service', extensionId, serviceId: 'api-testing.service' })),
      context.registerCapability(capability({ kind: 'tool', extensionId, toolName: 'api-testing.run' })),
      context.registerCapability(capability({ kind: 'projection', extensionId, projectionKey: 'api-testing.run-status' })),
      context.registerCapability(capability({ kind: 'api', extensionId, method: 'api-testing.create-run' })),
      context.registerCapability(capability({ kind: 'api', extensionId, method: 'api-testing.get-run' })),
      context.registerControlledApi(createRunApi(provider)),
      context.registerControlledApi(getRunApi(provider)),
    ]
    return { dispose: () => { for (const dispose of disposers.reverse()) dispose() } }
  },
}
