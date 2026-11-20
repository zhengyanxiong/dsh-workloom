# Workloom Capability Layer 第一阶段设计

状态：已确认（2026-11-18）。本文记录通用 Extension Host 的接口边界与第一阶段验收范围，不包含 Workflow Layer，也不表示实现已经完成。

## 目标

Workloom 统一管理可插拔开发能力的注册、生命周期、Task policy、Prompt、Tool、Projection、受控 API、UI 过滤和授权。API Testing 是第一个接入方；后续开发流程 Agent 与 MCP 复用同一 Extension 接口。

本阶段只在 `dsh-workloom` 中定义接口并使用 fake extension 验证，不修改 DSH 仓库，不安装 Profile 插件，不运行真实 Ouroboros，不修改活动 Profile。

## 约束

- Profile 安装 Extension，并提供 `enabled` 默认值和完整 Provider config。
- Task 只能覆盖 `extensions.<id>.enabled`，不能覆盖 Provider config。
- 有效开关按 `task.extensions[id].enabled ?? profile.extensions[id].enabled ?? definition.defaultEnabled` 解析。
- 不持久化解析后的值，也不遍历同步 Task。
- Extension 在 Loom-owned Cordis Context 中最多激活一次；Loom 关闭或配置重载时集中释放所有 effect。
- Task policy 必须同时约束 Prompt、Tool schema、Tool execution、Projection、受控 API 和 UI；只隐藏 UI 不构成授权。
- 每个 Session 通过可信的 `SessionId → TaskId` 绑定解析 policy；请求体不能提供或覆盖身份字段。
- Extension 只能通过 Loom 声明式扩展点贡献能力，不得注入全局 DOM/CSS、任意端口、未认证路由或第二套 UI runtime。

## 推荐接口

公共 wire/type contract 位于 `src/api/extensions.ts`，只依赖领域类型和类型导入；具体 DSH/Cordis 适配位于 `src/platform/dsh/extension-host.ts`。

```ts
export type LoomExtensionId = Branded<'loom.extension.id'>
export type LoomTaskId = Branded<'loom.task.id'>
export type LoomSessionId = Branded<'loom.session.id'>

export interface LoomExtensionProfileConfig<ProviderConfig> {
  readonly enabled?: boolean | undefined
  readonly config: ProviderConfig
}

export interface LoomExtensionTaskConfig {
  readonly enabled?: boolean | undefined
}

export interface LoomExtensionDefinition<ProviderConfig> {
  readonly id: LoomExtensionId
  readonly defaultEnabled: boolean
  readonly validateProfileConfig: (value: unknown) => ProviderConfig
  readonly activate: (context: LoomExtensionContext<ProviderConfig>) => LoomExtensionActivation
}

export interface TaskExtensionPolicy {
  readonly extensionId: LoomExtensionId
  readonly taskId: LoomTaskId
  readonly enabled: boolean
  isEnabled(): boolean
  assertEnabled(): void
}

export interface LoomExtensionHost {
  register<ProviderConfig>(definition: LoomExtensionDefinition<ProviderConfig>): () => void
  bindSession(input: { readonly sessionId: LoomSessionId; readonly taskId: LoomTaskId }): () => void
  resolvePolicy(input: {
    readonly sessionId: LoomSessionId
    readonly extensionId: LoomExtensionId
    readonly profile: LoomExtensionProfileConfig<unknown>
    readonly task?: LoomExtensionTaskConfig | undefined
  }): TaskExtensionPolicy
  visible(extensionId: LoomExtensionId, sessionId: LoomSessionId): boolean
  dispose(): Promise<void>
}
```

Extension capability 使用带 `extensionId` 的判别联合，第一阶段覆盖 `service`、`tool`、`projection`、`event`、`api` 和 `ui`。受控 API 以声明式 method descriptor 注册，由 Loom dispatcher 统一认证、校验 Origin/CSRF、从连接上下文取得 Session/Task 身份，再调用 `TaskExtensionPolicy.assertEnabled()`；Extension handler 不信任请求体中的身份字段。

`LoomExtensionContext` 只暴露受限注册入口和已校验的 Provider config，不暴露可绕过 Loom policy 的任意 DSH Context。所有注册返回 disposer，并由 Extension Host 统一纳入 Loom 生命周期。

## 生命周期与数据流

1. Profile loader 发现已安装 Extension，并交给 Extension Host 登记。
2. Host 校验 Profile `enabled` 与 Provider config；未安装的 Extension 不因 Profile 配置而隐式可用。
3. Loom 为每个 Session 建立可信的 Task 绑定。
4. 第一个有效开关为 `true` 的 Task 出现时，Host 在 Loom-owned Context 中激活 Extension 一次；其他 Task 复用该 activation。
5. Prompt、Tool schema、Tool execution、Projection wire、受控 API 和 UI slot 都通过同一个 Task policy 判断。
6. Task `enabled: false` 不接收也不能调用 Extension 贡献，但不触发重复加载或全局卸载。
7. Loom 关闭或配置重载时，Host 按注册顺序释放所有 Extension activation 和 contribution disposer。

## 配置错误与授权失败

以下情况 fail closed，并使用结构化错误：未知 Extension id、非法 boolean、Task 提供 `config`、未绑定 Session、伪造 Task/Session 身份、禁用 Task 调用 capability、不可用 Extension、未知受控 API method、受控 API 输入无效。

客户端隐藏贡献只负责呈现；Host 的 Tool execution、Projection wire 和受控 API dispatcher 必须再次执行 policy 检查。

## Fake Extension 验收

第一阶段契约测试至少覆盖：

- Profile 默认关闭时，Task 未配置继承关闭。
- Profile 默认开启时，Task 未配置继承开启。
- Task `enabled: false` 覆盖 Profile `true`。
- Task 不能覆盖 Provider config。
- 同一 Extension 被多个 Task 启用时只激活一次。
- Task 重试和 Session 切换不重复注册贡献。
- 禁用 Task 看不到也不能调用 Extension capability。
- 未知 Extension、非法 boolean、未绑定 Session 和伪造身份 fail closed。
- Loom dispose 后所有 registration disposer 都执行。

验证使用 Loom 自己的测试、typecheck、build 和独立端口 smoke。现有 DSH 实例 `http://127.0.0.1:3080` 不重启、不覆盖。

## 非目标

- 不实现 Workflow Layer。
- 不实现 API Testing Provider 或真实 Ouroboros 调用。
- 不修改 DSH 仓库和 DSH 核心 loop。
- 不安装新插件、不修改活动 Profile。
- 不用重复 Cordis profile/进程为每个 Task 提供隔离。
