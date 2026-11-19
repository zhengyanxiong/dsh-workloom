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
const MAX_CASE_NAME_LENGTH = 200
const MAX_VARIABLES = 50
const MAX_VARIABLE_KEY_LENGTH = 100
const MAX_VARIABLE_VALUE_LENGTH = 1000


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
  const entries = Object.entries(variables)
  if (entries.length > MAX_VARIABLES) throw invalid('too many variables')
  for (const [key, entry] of entries) {
    if (key.length === 0 || key.length > MAX_VARIABLE_KEY_LENGTH || typeof entry !== 'string' || entry.length > MAX_VARIABLE_VALUE_LENGTH) {
      throw invalid('variables are invalid')
    }
    result[key] = entry
  }
  return result
}

const parseCreateRunInput = (value: unknown): CreateApiTestingRunInput => {
  const input = parseObject(value, 'create-run input')
  if (Object.keys(input).some(key => key !== 'caseName' && key !== 'variables')) {
    throw invalid('create-run input has unknown fields')
  }
  if (typeof input.caseName !== 'string' || input.caseName.length === 0 || input.caseName.length > MAX_CASE_NAME_LENGTH) throw invalid('caseName is invalid')
  return {
    caseName: input.caseName,
    variables: input.variables === undefined ? undefined : parseVariables(input.variables),
  }
}

const parseGetRunInput = (value: unknown): { readonly runId: ApiTestingRunId } => {
  const input = parseObject(value, 'get-run input')
  if (Object.keys(input).some(key => key !== 'runId')) throw invalid('get-run input has unknown fields')
  if (typeof input.runId !== 'string' || input.runId.length === 0 || input.runId.length > MAX_CASE_NAME_LENGTH) throw invalid('runId is invalid')
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
