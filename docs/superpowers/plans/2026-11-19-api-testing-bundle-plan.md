# API Testing Bundle Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有通用 Loom Extension Host 上交付一个默认关闭、fake-provider 驱动、无网络副作用的 `api-testing-bundle`，验证 Profile config、单次激活、Task policy 和 controlled API 的完整业务链路。

**Architecture:** `src/extensions/api-testing/contract.ts` 定义 provider 与业务 DTO；`fake-provider.ts` 实现确定性内存 provider；`definition.ts` 将 provider 包装为 Loom Extension definition，并仅通过 Host context 注册 capability 与 controlled API。Bundle 不依赖 DSH/Cordis，Host 负责身份、policy、生命周期和 API dispatch。

**Tech Stack:** TypeScript strict mode, branded IDs, Vitest, existing Loom Extension Host, pnpm.

---

## Scope and invariants

- 只修改 `E:\apps\dsh-workloom`。
- 不修改 `E:\apps\deepseek-harness`、活动 Profile、插件安装记录或 Task catalog persistence。
- 不运行真实 Ouroboros，不发起网络请求，不新增 UI。
- Extension id 为 `api-testing`，`defaultEnabled` 为 `false`。
- Provider config 只允许 `provider: 'fake'` 与可选 `autoComplete: boolean`；Task 只能覆盖 enabled。
- Controlled API method 固定为 `api-testing.create-run` 和 `api-testing.get-run`。
- 所有新增行为先写失败测试，确认失败原因正确，再实现最小代码。
- 每个垂直切片完成 focused test、typecheck/build 后提交 Conventional Commit。

## File map

- Create: `src/extensions/api-testing/contract.ts` — provider contract、branded run ID、DTO 和结构化 provider error。
- Create: `src/extensions/api-testing/fake-provider.ts` — 无网络、无文件 I/O 的确定性内存 provider。
- Create: `src/extensions/api-testing/definition.ts` — config 校验、provider 创建、capability/API registration、disposer。
- Create: `src/extensions/api-testing/index.ts` — 公开导出 bundle definition、contract 和 factory。
- Modify: `src/api/index.ts` — 仅在需要作为 public API 暴露时导出稳定 bundle contract；不得导出 Host implementation。
- Create: `tests/extensions/api-testing/fake-provider.spec.ts` — fake provider contract tests。
- Create: `tests/extensions/api-testing/bundle.spec.ts` — bundle/Host contract tests。
- Modify: `src/index.ts` only if current package entry is the established extension registration surface; otherwise keep bundle opt-in and do not mount it into the active profile.

## Task 1: Define API testing provider contract

**Files:**
- Create: `src/extensions/api-testing/contract.ts`
- Create: `tests/extensions/api-testing/fake-provider.spec.ts`
- Modify: `src/api/index.ts` only if the repository public API convention requires exporting the contract

- [ ] **Step 1: Write the failing type/contract test**

Create `tests/extensions/api-testing/fake-provider.spec.ts` with imports from `src/extensions/api-testing/contract.ts` and this compile-time-shaped test data:

```ts
import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ApiTestingProvider,
  ApiTestingRun,
  ApiTestingRunId,
  CreateApiTestingRunInput,
} from '../../../src/extensions/api-testing/contract.ts'

const runId = brandString<ApiTestingRunId>('run-1')

it('defines stable API testing DTOs', () => {
  const input: CreateApiTestingRunInput = { caseName: 'smoke' }
  const run: ApiTestingRun = { runId, caseName: input.caseName, status: 'queued', variables: {} }
  expectTypeOf(run.status).toEqualTypeOf<'queued' | 'running' | 'passed' | 'failed'>()
  expect(run.caseName).toBe('smoke')
  expectTypeOf<ApiTestingProvider>().toHaveProperty('createRun')
})
```

- [ ] **Step 2: Run the test and confirm the expected missing-module failure**

Run:

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts
```

Expected: FAIL during module resolution because `src/extensions/api-testing/contract.ts` does not exist.

- [ ] **Step 3: Implement the contract**

Create the contract with these exact public shapes:

```ts
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
```

Do not add session/task identity fields, provider instances, network clients, or arbitrary metadata to these DTOs.

- [ ] **Step 4: Run the contract test**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit the contract slice**

```text
git add src/extensions/api-testing/contract.ts tests/extensions/api-testing/fake-provider.spec.ts
git commit -m "feat(workloom): define api testing provider contract"
```

## Task 2: Implement deterministic fake provider

**Files:**
- Create: `src/extensions/api-testing/fake-provider.ts`
- Modify: `tests/extensions/api-testing/fake-provider.spec.ts`

- [ ] **Step 1: Add failing provider behavior tests**

Append tests covering the real provider behavior:

```ts
import { createFakeApiTestingProvider } from '../../../src/extensions/api-testing/fake-provider.ts'
import { ApiTestingProviderError } from '../../../src/extensions/api-testing/contract.ts'

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
```

Use constants in the implementation for `caseName` max length 200, at most 50 variables, variable key max 100, and value max 1000. Keep these limits internal and test boundary behavior only where needed.

- [ ] **Step 2: Run the provider tests and verify they fail because the factory is absent**

Run:

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts
```

Expected: FAIL with missing `createFakeApiTestingProvider` implementation, not a test syntax error.

- [ ] **Step 3: Implement the minimal in-memory provider**

Implement:

```ts
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

export function createFakeApiTestingProvider(
  options: FakeApiTestingProviderOptions = {},
): ApiTestingProvider {
  const runs = new Map<ApiTestingRunId, ApiTestingRun>()
  let sequence = 0
  const autoComplete = options.autoComplete === true

  const validateInput = (input: CreateApiTestingRunInput): void => {
    if (input.caseName.length === 0 || input.caseName.length > 200) {
      throw new ApiTestingProviderError('invalid_case', 'caseName is invalid')
    }
    const variables = input.variables ?? {}
    if (Object.keys(variables).length > 50) {
      throw new ApiTestingProviderError('invalid_case', 'variables are invalid')
    }
    for (const [key, value] of Object.entries(variables)) {
      if (key.length === 0 || key.length > 100 || value.length > 1000) {
        throw new ApiTestingProviderError('invalid_case', 'variables are invalid')
      }
    }
  }

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
      return { ...run, variables: { ...run.variables } }
    },
    async getRun(runId) {
      const run = runs.get(runId)
      if (run === undefined) throw new ApiTestingProviderError('run_not_found', 'run was not found')
      return { ...run, variables: { ...run.variables } }
    },
  }
}
```

Before committing, ensure the source remains under 300 lines and does not import Node, DSH runtime, or network libraries.

- [ ] **Step 4: Run provider tests and typecheck**

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts
pnpm run typecheck
```

Expected: all fake-provider tests pass and all compiler faces pass.

- [ ] **Step 5: Commit the provider slice**

```text
git add src/extensions/api-testing/fake-provider.ts tests/extensions/api-testing/fake-provider.spec.ts
git commit -m "feat(workloom): add deterministic api testing fake provider"
```

## Task 3: Define bundle config and controlled API parsers

**Files:**
- Create: `src/extensions/api-testing/definition.ts`
- Create: `src/extensions/api-testing/index.ts`
- Create: `tests/extensions/api-testing/bundle.spec.ts`

- [ ] **Step 1: Write failing bundle contract tests**

Create a bundle test with branded IDs and the existing `createLoomExtensionHost`. Assert config acceptance/rejection and activation roster:

```ts
import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import { createLoomExtensionHost, ExtensionHostError } from '../../../src/host/extension-host.ts'
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
  expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'ouroboros' } } })).toThrowError(ExtensionHostError)
  expect(() => host.resolvePolicy({ sessionId, extensionId, profile: { enabled: true, config: { provider: 'fake', unexpected: true } } })).toThrowError(ExtensionHostError)
})
```

- [ ] **Step 2: Run the bundle test and verify expected module/definition failure**

Run:

```text
pnpm exec vitest run tests/extensions/api-testing/bundle.spec.ts
```

Expected: FAIL because `definition.ts` and `apiTestingExtension` do not exist.

- [ ] **Step 3: Implement config validation and extension definition**

Define:

```ts
export interface ApiTestingProfileConfig {
  readonly provider: 'fake'
  readonly autoComplete?: boolean | undefined
}

const assertRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ExtensionHostError('invalid_config', 'api-testing profile config must be an object')
  }
  return value as Record<string, unknown>
}
```

Do not use a new `any` cast. If the host error type cannot be used from this DSH-independent extension module, add a local `ApiTestingConfigError` and map it at the Host boundary in the bundle test only; prefer the existing structured extension error contract if it is import-safe under project rules.

`validateProfileConfig` must require exactly `provider`, allow optional `autoComplete`, require provider value `fake`, and return `{ provider: 'fake', autoComplete }`.

The definition must activate a provider and register:

```text
service api-testing.service
tool api-testing.run
projection api-testing.run-status
api api-testing.create-run
api api-testing.get-run
```

- [ ] **Step 4: Add strict API parsers and handler mapping**

Implement parser helpers in `definition.ts`:

```ts
function parseCreateRunInput(input: unknown): CreateApiTestingRunInput { /* strict object, caseName, variables */ }
function parseGetRunInput(input: unknown): { readonly runId: ApiTestingRunId } { /* strict object, runId */ }
```

They must reject null, arrays, unknown keys, missing fields, non-string case names/run IDs, and non-string variables. API handlers must call only the provider and return provider DTOs. Provider errors may be thrown unchanged inside the controlled handler; the Host will map non-Host errors to `invalid_input` under the existing contract.

- [ ] **Step 5: Export only stable bundle symbols**

`index.ts` should export `ApiTestingProfileConfig`, provider contract types, `createFakeApiTestingProvider`, and `apiTestingExtension`. It must not export private parser functions or provider Map state.

- [ ] **Step 6: Run bundle tests and typecheck**

```text
pnpm exec vitest run tests/extensions/api-testing/bundle.spec.ts
pnpm run typecheck
```

Expected: config and roster tests pass.

- [ ] **Step 7: Commit the bundle definition slice**

```text
git add src/extensions/api-testing/definition.ts src/extensions/api-testing/index.ts tests/extensions/api-testing/bundle.spec.ts
git commit -m "feat(workloom): define api testing extension bundle"
```

## Task 4: Verify controlled API authorization and lifecycle integration

**Files:**
- Modify: `tests/extensions/api-testing/bundle.spec.ts`
- Modify: `src/extensions/api-testing/definition.ts` only if a focused test exposes a behavior gap

- [ ] **Step 1: Add failing authorization/lifecycle tests**

Add tests for the complete Host path:

```ts
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
  const read = await host.callControlledApi({
    sessionId,
    taskId,
    extensionId,
    method: 'api-testing.get-run',
    input: { runId: (created as { runId: string }).runId },
  })
  expect(read).toEqual(created)
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
```

- [ ] **Step 2: Run the tests and verify any missing behavior fails for the right reason**

Run:

```text
pnpm exec vitest run tests/extensions/api-testing/bundle.spec.ts
```

Expected: authorization tests fail only for unimplemented bundle API or policy integration, not because of malformed test setup.

- [ ] **Step 3: Implement the minimum fixes**

Keep policy enforcement in `src/host/extension-host.ts`; do not add bypasses in the bundle. If the tests reveal the existing Host maps all provider errors to `invalid_input`, preserve that existing boundary and assert only the stable Host error code. If a capability disposer is missing, return the disposer returned by each registration and compose them in reverse order through the activation object.

- [ ] **Step 4: Run focused bundle tests and typecheck**

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts tests/extensions/api-testing/bundle.spec.ts
pnpm run typecheck
```

Expected: all provider and bundle tests pass.

- [ ] **Step 5: Commit integration tests**

```text
git add src/extensions/api-testing tests/extensions/api-testing
 git commit -m "test(workloom): verify api testing bundle authorization"
```

## Checkpoint: Fake bundle complete

- [ ] Fake provider tests pass.
- [ ] Bundle config, capability roster, API parser, authorization and disposal tests pass.
- [ ] `pnpm run typecheck` passes.
- [ ] No DSH, Profile, plugin installation, Ouroboros or Task persistence files changed.

## Task 5: Public export and repository verification

**Files:**
- Modify: `src/api/index.ts` only if public export is required by existing package convention.
- Modify: `src/index.ts` only if it is the established opt-in extension registration entry point; do not auto-enable or mount into active Profile.
- Test: existing contract tests if exports change.

- [ ] **Step 1: Inspect package entry conventions and write a failing export test if needed**

Check `src/index.ts`, `src/api/index.ts`, package exports, and existing tests. If consumers are expected to import `apiTestingExtension` from the package root, add a test that imports it from that root. If extension modules are intentionally opt-in internal modules, do not add a root export merely for symmetry.

- [ ] **Step 2: Implement the smallest export change**

Export only stable contract and definition symbols. Do not export fake provider internal state or parser helpers. Do not instantiate the bundle in the production DSH service or modify active Profile config in this task.

- [ ] **Step 3: Run focused tests, typecheck and build**

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts tests/extensions/api-testing/bundle.spec.ts tests/contracts/extension-host.spec.ts
pnpm run typecheck
pnpm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit export changes if any**

```text
git add src/api/index.ts src/index.ts tests
 git commit -m "feat(workloom): expose api testing bundle contracts"
```

Skip this commit when no export change is needed.

## Task 6: Full verification and isolated smoke

**Files:**
- No production changes expected.
- Scratch only: `.loomtmp/capability-layer/` if logs need to be retained.

- [ ] **Step 1: Run the complete repository test suite**

Run in the Workloom root:

```text
pnpm test
```

Expected: all existing and new tests pass; no tests modify the active DSH profile.

- [ ] **Step 2: Run the final typecheck and build**

```text
pnpm run typecheck
pnpm run build
```

Expected: all three TypeScript compiler faces and both build entries pass.

- [ ] **Step 3: Run isolated smoke on port 3090**

```text
pnpm run smoke
```

Use the existing smoke runner defaults documented in `scripts/smoke.mjs`; verify its output explicitly reports isolated profile `loom-smoke` and port `3090`. Do not stop, restart, or inspect by modifying `http://127.0.0.1:3080`. If browser Chrome is unavailable, report HTTP smoke passed and browser UI skipped.

- [ ] **Step 4: Audit diff and scope**

```text
git diff --check
git diff --stat
git status --short
```

Confirm that pre-existing `README.md`, `assets/architecture.html`, and `assets/architecture.svg` remain uncommitted and untouched, and that no DSH repository path appears in the diff.

- [ ] **Step 5: Request code review before final completion**

Review the final diff against the Phase 2 design. Confirm no API input/output, provider state, credentials, or arbitrary errors are logged. Confirm all new files are under 300 lines and all public interfaces use strict types.

- [ ] **Step 6: Commit only after all checks pass**

```text
git status --short
git diff --check
git commit --allow-empty -m "chore(workloom): verify api testing bundle phase two"
```

Use the empty verification commit only if the preceding commits already contain all code and the repository policy requires an explicit phase checkpoint; otherwise do not create a no-op commit.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Provider contract accidentally leaks into DSH runtime | High | Keep all bundle files under `src/extensions/api-testing`, import only public extension API and local contract, run boundary typecheck/tests. |
| Test provider state leaks across activations | High | Provider instance owns a private Map; test two instances and Host dispose. |
| API input becomes an identity/config bypass | High | Parsers reject sessionId/taskId/provider/config fields; Host binding remains the only identity source. |
| Existing Host maps provider errors to generic invalid_input | Medium | Assert stable Host boundary codes and keep provider errors structured internally. |
| Auto-completion introduces flaky timing | Medium | Use deterministic synchronous state choice (`queued` or `passed`) without timers. |
| Bundle becomes active unintentionally | High | Keep registration opt-in in tests; do not mount into active Profile or service bootstrap in Phase 2. |
