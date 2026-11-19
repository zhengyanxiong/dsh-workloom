import { brandString } from '@deepseek-ai/dsh-brand'
import {
  ApiTestingProviderError,
  type ApiTestingProvider,
  type ApiTestingRun,
  type ApiTestingRunId,
  type CreateApiTestingRunInput,
} from './contract.ts'

export interface FakeApiTestingProviderOptions {
  readonly autoComplete?: boolean | undefined
}

const MAX_CASE_NAME_LENGTH = 200
const MAX_VARIABLES = 50
const MAX_VARIABLE_KEY_LENGTH = 100
const MAX_VARIABLE_VALUE_LENGTH = 1000

export function createFakeApiTestingProvider(
  options: FakeApiTestingProviderOptions = {},
): ApiTestingProvider {
  const runs = new Map<ApiTestingRunId, ApiTestingRun>()
  let sequence = 0
  const autoComplete = options.autoComplete === true

  const validateInput = (input: CreateApiTestingRunInput): void => {
    if (input.caseName.length === 0 || input.caseName.length > MAX_CASE_NAME_LENGTH) {
      throw new ApiTestingProviderError('invalid_case', 'caseName is invalid')
    }
    const variables = input.variables ?? {}
    if (Object.keys(variables).length > MAX_VARIABLES) {
      throw new ApiTestingProviderError('invalid_case', 'variables are invalid')
    }
    for (const [key, value] of Object.entries(variables)) {
      if (key.length === 0 || key.length > MAX_VARIABLE_KEY_LENGTH || value.length > MAX_VARIABLE_VALUE_LENGTH) {
        throw new ApiTestingProviderError('invalid_case', 'variables are invalid')
      }
    }
  }

  const cloneRun = (run: ApiTestingRun): ApiTestingRun => ({ ...run, variables: { ...run.variables } })

  return {
    async createRun(input) {
      validateInput(input)
      sequence += 1
      const runId = brandString<ApiTestingRunId>(`fake-run-${sequence}`)
      const run: ApiTestingRun = {
        runId,
        caseName: input.caseName,
        status: autoComplete ? 'passed' : 'queued',
        variables: { ...(input.variables ?? {}) },
      }
      runs.set(runId, run)
      return cloneRun(run)
    },
    async getRun(runId) {
      const run = runs.get(runId)
      if (run === undefined) throw new ApiTestingProviderError('run_not_found', 'run was not found')
      return cloneRun(run)
    },
  }
}
