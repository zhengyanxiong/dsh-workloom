# TypeScript 开发规范

本规范是 Workloom 的强制标准。新增和修改代码必须遵守；存量代码在重构计划中逐步迁移，迁移期间不得扩大例外。

配套文档：

- [架构收敛与重构计划](./architecture-refactor-plan.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)

## 1. 编译与类型检查

- 必须保持 `tsconfig.base.json` 的严格设置，不得为了通过编译关闭：
  - `strict`
  - `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`
  - `noUnusedLocals`
  - `noUnusedParameters`
  - `noImplicitOverride`
  - `noFallthroughCasesInSwitch`
- 修改后必须通过：
  ```bash
  pnpm run typecheck
  pnpm test
  pnpm run build
  ```
- 不允许用新增 `any`、`@ts-ignore`、`@ts-expect-error` 或放宽 tsconfig 来绕过类型问题。
- `as` 只允许用于已经验证过的边界收窄；不得用 `as unknown as X` 伪造类型。

## 2. 分层与导入边界

目标依赖方向：

```text
client        -> api, ports, ui
host          -> app, ports, storage, git
app           -> domain, api, ports
platform/dsh  -> ports, DSH packages
api           -> domain
domain        -> 仅本地品牌类型（最终不依赖 DSH）
```

强制规则：

- `src/domain` 不得导入 React、Node、DSH 运行时包。
- `src/host` 不得导入 React。
- `src/client` 不得导入 `src/host` 的实现文件或 `src/host/catalog.ts`。
- feature 组件不得直接导入 `@deepseek-ai/dsh-*` 服务包。
- DSH 的 sessions、slots、layout、remote、workspace files、jobs、native open 等能力只能通过 `src/platform/dsh` 适配层访问。
- 公共类型只能从 `src/api` 暴露，不得在 `src/types.ts` 中 `export type * from './host/...'`。
- 禁止循环依赖；发现循环时拆分 `api` / `ports` / `ui`，不要用动态 import 掩盖。

迁移期间允许的临时例外必须集中列出，不能扩散到新文件。

## 3. 类型设计

- 公开对象使用 `interface`；联合类型、映射类型、别名使用 `type`。
- 公开字段默认 `readonly`；不要在内部随意复制可变对象。
- 跨边界 ID 使用 branded type，例如 `Branded<'loom.task'>`，不得用裸 `string` 代替。
- 状态使用判别联合（discriminated union），不要用多个布尔值表达互斥状态。
- 对闭合联合使用 `switch` + `assertNever`，不要漏分支。
- 边界输入使用 `unknown` + 显式校验（zod/schema），不要在业务内部重复防御已由静态类型保证的值。
- 禁止 `any`。确实无法避免时，必须在同一处用注释说明为什么无法收窄，并尽量隔离在边界。
- 可选字段使用 `?: T | undefined`，不要用 `?: T` 配合隐式 `undefined` 改变语义。
- 返回对象不要暴露内部可变引用；必要时返回拷贝。

## 4. 命名与文件组织

- 变量、函数、参数：`camelCase`。
- 类型、组件、枚举：`PascalCase`。
- 模块级常量：`UPPER_SNAKE_CASE`。
- 组件文件：`PascalCase.tsx`；hook：`useXxx.ts`；纯函数：`camelCase.ts`。
- 一个文件一个主要导出；辅助函数不导出，除非被测试或同层复用。
- feature 目录内部不得从另一个 feature 的内部文件导入；跨 feature 只能通过其公开 `index.ts`。
- 测试文件镜像被测模块路径，例如：
  ```text
  src/client/features/task/TaskWorkbench.tsx
  tests/client/features/task/TaskWorkbench.spec.tsx
  ```
- 文件末尾恰好一个换行；不要保留空文件、调试文件、临时脚本。

## 5. 函数与异步

- 导出的函数写明确返回类型；内部短函数可推断。
- 异步函数必须返回 `Promise<T>`，不得使用“回调 + Promise”混用。
- 禁止 floating promise：
  - 事件处理器中用 `void promise.catch(...)`；
  - 或者在 async 函数内 `await`。
- 不要空 `catch`。允许忽略错误时必须写明原因：
  ```ts
  catch {
    // 浏览器禁用 localStorage；偏好保留在内存中。
  }
  ```
- 错误在边界转换：内部抛 typed error，Host Remote 返回 `RemoteResult`，客户端显示本地化错误。
- 失败时保留用户数据；不要为了显示错误清空仍然有效的内容。
- 超时、取消和重试必须有明确归属；不要用 `setTimeout` 假装取消。

## 6. React 客户端规则

- 组件只通过 props 和公开 hooks 接收数据；不得直接读取 DSH 全局服务。
- 派生状态用计算值或 `useMemo`，不要用 `useEffect` 同步两份状态。
- effect 必须返回清理函数；订阅、定时器、AbortController、事件监听必须成对释放。
- 一个组件超过 250 行，或超过 8 个独立 `useState`，必须拆分。
- 列表 key 必须稳定，不使用数组 index 作为可变列表的 key。
- 新交互必须支持键盘焦点、Escape 关闭、点击遮罩关闭（适用时）。
- 图标按钮必须提供 `aria-label` 和 tooltip；纯装饰图标 `aria-hidden`。
- 不引入新的全局 CSS 选择器；样式通过 `ui/tokens` 和组件内聚样式表达。

## 7. 样式、主题与文案

- 颜色、间距、圆角、字号优先使用 `src/client/ui/tokens.ts` 或 DSH token；禁止新增硬编码颜色值。
- 主题必须跟随 DSH 的 `body[data-ds-dark-theme]`，不能只依赖系统 `prefers-color-scheme`。
- 新控件复用 `ui/primitives`，不要在 feature 中直接导入 DSH UI primitives。
- 所有用户可见文案必须走 locale 字典；JSX 中禁止硬编码中文/英文产品文案。
- 表单、弹窗、菜单、错误提示必须同时检查浅色和深色。
- 图标只能使用现有图标库；新增图标需要设计确认。

## 8. 测试

- 每个行为变更至少有一个测试能覆盖目标场景；修复缺陷必须先能复现。
- 领域逻辑测试不依赖文件系统、网络、DSH 或时间。
- Host 测试使用临时目录；结束后必须清理。
- 客户端组件测试优先通过 props 和用户交互断言，不依赖内部实现细节。
- DSH 适配层必须有契约测试，使用 fake port 验证：
  - 方法存在性；
  - 错误路径；
  - 取消/清理；
  - 降级行为。
- 测试命名描述行为，不写“测试正确性”。
- 不允许用 `--passWithNoTests` 或降低覆盖率来让检查通过。

## 9. DSH 兼容规则

- 只有 `src/platform/dsh` 可以导入 DSH 的**运行时服务**；`src/api` 和 `src/ports` 只允许 `import type` 使用 DSH 类型，禁止运行时导入。
- `src/client` 的 DSH UI primitives 和 type-only 类型在 Phase 3 前视为存量例外；新增 DSH 服务调用必须经过 `ports` / `platform`。
- 每一处 DSH 能力必须有 port 接口；没有接口的能力不允许直接进入 feature。
- DSH 升级时先运行 contracts 测试，再改 adapter；不得在整个 `client` 中散改。
- `lib/typert.*` 是生成文件；修改 Host Remote 后必须重新生成并提交，不手改。
- 包版本变更时必须更新兼容性说明和 changelog。
- 禁止依赖 DSH 未导出的内部文件路径；只能使用 package exports。

## 10. 文件规模与复杂度

- 新增文件原则上不超过 300 行。
- 超过 500 行的新文件必须拆分；存量文件按重构计划迁移，不得继续增长。
- 一个模块只承担一个变化原因：
  - 持久化不要和 Git 操作混在一起；
  - RPC 校验不要和业务状态机混在一起；
  - UI 布局不要和会话生命周期混在一起。
- 复制粘贴超过两次的逻辑必须提取；只有确实相同的语义才共享。

## 11. 提交与检查清单

提交前确认：

- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm run build` 通过
- [ ] 没有新增跨层导入
- [ ] 没有新增 `any` / `@ts-ignore` / 未说明的 `as`
- [ ] 新行为有测试
- [ ] 新文案在 locale 中
- [ ] JSDoc 使用多行块，注释每行不超过 100 列
- [ ] 浅色、深色都检查
- [ ] 菜单、弹窗可通过空白点击/Escape 关闭（适用时）
- [ ] 没有提交生成目录、临时文件、调试日志、密钥
- [ ] 提交信息符合 `type(workloom): English summary`

## 12. 注释与 JSDoc

- 声明使用 JSDoc 时必须使用多行块，不允许写成一条很长的 `/** ... */`：

  ```ts
  // 不允许
  /** Read one workspace and return its status. @param id workspace id. */

  // 必须
  /**
   * Read one workspace and return its status.
   *
   * @param id - workspace identity.
   * @returns the workspace status.
   */
  ```

- JSDoc 的正文、`@param`、`@returns`、`@throws` 每项独占一行，不把多个标签挤在同一行。
- 注释和 JSDoc 每行不超过 100 列；超过时在语义边界换行。
- 摘要和标签之间保留一个空行；标签顺序固定为 `@param`、`@returns`、`@throws`。
- 行尾不写注释；注释放在被说明代码的上方。
- 不写只复述代码的注释；解释“为什么”、约束、边界和副作用。
- 业务文案不写在注释里，用户可见文案必须进入 locale。
- 存量单行 JSDoc 不要求一次性批量重写，但修改到该文件时必须顺手改成多行。

## 13. 例外

例外必须同时满足：

1. 有具体技术原因；
2. 影响范围最小；
3. 有测试或人工验证覆盖；
4. 在代码旁写清楚为什么；
5. 在 PR/提交说明中记录。

“先这样，后面再改”不是例外理由。
