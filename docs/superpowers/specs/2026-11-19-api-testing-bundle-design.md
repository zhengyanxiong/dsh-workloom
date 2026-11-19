# API Testing Bundle Phase 2 设计

状态：已批准设计，待实现评审（2026-11-19）。本文定义 Workloom 第一个业务 Extension 的 fake-provider 版本；不实现真实 Ouroboros adapter。

## 目标

在现有通用 Loom Extension Host 上实现一个可独立测试的 `api-testing-bundle`，验证从 Profile provider config、Extension activation、Task policy 到受控 API 调用的完整业务扩展链路。

本阶段交付可注入的内存 fake provider。未来 Ouroboros adapter 只需实现相同 provider contract，不改变 Extension Host 或业务 API contract。

## 约束与非目标

- 只修改 `E:\apps\dsh-workloom`。
- 不修改 `E:\apps\deepseek-harness`。
- 不安装 Profile 插件，不修改活动 Profile。
- 不运行真实 Ouroboros，不发起网络请求。
- 不修改 Task catalog persistence，不增加 Task 配置迁移。
- 不增加 UI 页面或第二套 UI runtime。
- 不暴露任意 DSH/Cordis context、provider 实例或原始异常给调用方。
- Extension 默认关闭；fake provider 只通过显式测试配置启用。

## 模块边界

```text
src/extensions/api-testing/
├── contract.ts       # Provider contract、输入输出 DTO、错误类型
├── fake-provider.ts  # 内存 provider，确定性状态转换
├── definition.ts     # Loom Extension definition、Profile config 校验和激活
└── index.ts          # 业务扩展公开导出
```

测试位于：

```text
tests/extensions/api-testing/
├── fake-provider.spec.ts
└── bundle.spec.ts
```

`src/extensions/api-testing` 只依赖 `src/api/extensions.ts` 与自身 contract；不得导入 `src/host`、`src/client`、Cordis 或 DSH runtime。

## Provider contract

Provider 是业务扩展内部边界，未来真实 adapter 与 fake provider 均实现它：

```ts
export type ApiTestingRunId = Branded<'loom.api-testing.run.id'>

export type ApiTestingRunStatus =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'

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

export interface ApiTestingProvider {
  createRun(input: CreateApiTestingRunInput): Promise<ApiTestingRun>
  getRun(runId: ApiTestingRunId): Promise<ApiTestingRun>
}
```

Provider 错误使用结构化 `ApiTestingProviderError`，至少包含 `code: 'run_not_found' | 'invalid_case'`。不把底层异常对象、凭据或完整业务 payload 透传到日志或 controlled API 错误消息。

## Fake provider 行为

Fake provider 为每个 instance 持有独立内存 Map：

1. `createRun` 拒绝空或超长 `caseName`，拒绝变量 key/value 非字符串。
2. 合法创建返回唯一 branded `runId`，初始状态为 `queued`。
3. `autoComplete: true` 时，创建后确定性返回 `passed`；默认 `autoComplete: false` 时保持 `queued`。
4. `getRun` 返回已创建的不可变 DTO；未知 ID 返回 `run_not_found`。
5. provider 不读取环境变量、不访问文件、不访问网络。

为避免时间和异步调度造成 flaky 测试，Phase 2 不模拟真实定时状态机；`autoComplete` 是确定性配置开关。

## Extension 配置与 capability

Profile config 的 provider-specific 部分：

```ts
interface ApiTestingProfileConfig {
  readonly provider: 'fake'
  readonly autoComplete?: boolean | undefined
}
```

Extension definition：

- `id`: `api-testing`
- `defaultEnabled`: `false`
- `validateProfileConfig`: 严格校验 `provider === 'fake'`、`autoComplete` 为 boolean 或缺省；拒绝未知字段。
- `activate`: 创建一个 fake provider，并注册下列贡献：

```text
service: api-testing.service
tool: api-testing.run
projection: api-testing.run-status
api: api-testing.create-run
api: api-testing.get-run
```

本阶段不注册 UI capability。

## Controlled API contract

Extension 向 Host 注册两个 method：

### `api-testing.create-run`

Input：

```ts
{
  readonly caseName: string
  readonly variables?: Readonly<Record<string, string>>
}
```

Output：`ApiTestingRun`。

### `api-testing.get-run`

Input：

```ts
{
  readonly runId: string
}
```

Output：`ApiTestingRun`。

Parser 必须在 API 边界完成：

- object/null 检查；
- 必填字段类型检查；
- 未知字段拒绝；
- 字符串长度和变量数量限制；
- 不接受 sessionId、taskId、provider 或 config 字段作为请求身份或 provider 覆盖。

Session/Task 身份只由 Extension Host trusted binding 提供，不进入 API input。

## 错误语义

- Host policy 错误继续使用 `ExtensionHostError`，例如 `extension_disabled`、`session_unbound`、`identity_mismatch`。
- API parser 错误由 Host 映射为 `invalid_input`。
- provider `run_not_found` 映射为稳定的业务错误消息，不泄漏内部 Map 或实现细节。
- disabled Task、未绑定 Session、错误 Task identity 必须在 provider 调用前失败。

## 测试验收

### Fake provider contract tests

覆盖：

- 合法创建返回 `queued`；
- `autoComplete` 返回 `passed`；
- 查询已存在 run；
- 查询未知 run 返回结构化 `run_not_found`；
- 空 caseName、超长 caseName、非法 variables 被拒绝；
- 两个 provider instance 不共享状态。

### Bundle contract tests

覆盖：

- Profile config 默认值和未知字段拒绝；
- Extension activation 注册完整 capability roster；
- 两个 Session/Task 只触发一次 activation；
- `create-run` 和 `get-run` controlled API 返回 fake provider DTO；
- malformed API input 在 provider 调用前失败；
- disabled Task 看不到 capability 且不能调用 API；
- 未绑定 Session 和伪造 Task identity fail closed；
- Host dispose 调用 bundle activation disposer，后续调用失败；
- API 输入和日志不包含 provider instance 或敏感业务 payload。

## 验证与交付

实现期间每个垂直切片独立提交。最终必须运行：

```text
pnpm exec vitest run tests/extensions/api-testing/fake-provider.spec.ts tests/extensions/api-testing/bundle.spec.ts
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke
```

Smoke 继续使用隔离 Profile `loom-smoke` 和端口 `3090`；浏览器 UI 若环境没有 Chrome，只能报告 skipped，不能声称 UI smoke 通过。

## 后续扩展点

- 真实 Ouroboros adapter 实现 `ApiTestingProvider`；
- 增加显式 provider factory 和 capability registration metadata；
- 在单独迁移设计批准后增加 Task extension config persistence；
- 在独立 UI 设计阶段增加 API testing conversation view。
