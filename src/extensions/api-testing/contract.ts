import type { Branded } from '@deepseek-ai/dsh-brand'

export type ApiTestingRunId = Branded<'loom.api-testing.run.id'>

export type ApiTestingRunStatus = 'queued' | 'running' | 'passed' | 'failed'

export interface CreateApiTestingRunInput {
  readonly caseName: string
  readonly variables?: Readonly<Record<string, string>> | undefined
}

export interface ApiTestingRun {
  readonly runId: ApiTestingRunId
  readonly caseName: string
  readonly status: ApiTestingRunStatus
  readonly variables: Readonly<Record<string, string>>
  readonly error?: string | undefined
}

export type ApiTestingProviderErrorCode = 'run_not_found' | 'invalid_case'

export class ApiTestingProviderError extends Error {
  readonly code: ApiTestingProviderErrorCode

  constructor(code: ApiTestingProviderErrorCode, message: string) {
    super(message)
    this.name = 'ApiTestingProviderError'
    this.code = code
  }
}

export interface ApiTestingProvider {
  createRun(input: CreateApiTestingRunInput): Promise<ApiTestingRun>
  getRun(runId: ApiTestingRunId): Promise<ApiTestingRun>
}
