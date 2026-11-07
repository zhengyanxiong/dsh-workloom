# Workloom 架构收敛与重构计划

本计划用于解决三个问题：

1. 让 DSH 升级只需要改适配层，而不是全仓库搜改；
2. 让客户端、Host、领域模型和 DSH 平台代码有明确边界；
3. 让后续二次开发者能在 feature 层扩展，而不是继续修改上帝文件。

这不是业务模型重写。`src/domain/` 的项目、版本、Lock、任务、工作区、执行权模型继续保留。

## 当前基线

| 文件 | 行数 | 当前职责 |
|---|---:|---|
| `src/host/catalog.ts` | 1773 | 持久化、迁移、Git 工作区、任务、执行队列、审计 |
| `src/host/service.ts` | 1093 | Remote 校验、Session 生命周期、上下文注入、工具注册、执行权 |
| `src/client/LoomPanel.tsx` | 1446 | 顶栏、项目树、会话栏、弹窗、拖拽、Diff、布局 |
| `src/client/LoomForms.tsx` | 1346 | 项目 / 版本 / 任务表单与字段 |
| `src/client/index.ts` | 275 | DSH 服务直连、slot 注册、sidebar monkey patch |
| `src/client/projection.ts` | 526 | 视图投影与聚合 |

当前客户端约 47 个文件集中在 `src/client/` 一层，直接 DSH 导入约 98 处，`ui.*` 直接调用约 70 处。

## 目标结构

```text
src/
  domain/             纯领域模型，不依赖 React、Node、DSH 运行时
  api/                公共 wire 类型与公开请求/响应
  ports/              能力接口（DshClientPort、DshHostPort、CatalogPort）
  platform/
    dsh/              所有 DSH 具体 API 的唯一适配层
  app/                用例编排（project/version/task/workspace/execution）
  host/               RPC、持久化、Git、文件系统
  client/
    shell/            页面骨架、顶栏、布局、resize
    features/         project、version、task、workspace、session、preview、settings、open
    ui/               token、控件包装、原生 primitives 出口
    i18n/
  shared/             纯函数共享层，不能依赖 host/client
tests/
  unit/               领域、用例、适配器
  contracts/          DSH 适配层契约测试
  integration/        Host + Client 边界测试
```

## 分层规则

依赖方向只能向下：

```text
client -> api, ports, ui
host   -> app, ports, storage, git
app    -> domain, api, ports
platform/dsh -> ports, DSH packages
api    -> domain
domain -> nothing except a tiny local brand helper
```

禁止：

- `client` 导入 `host` 的实现文件；
- `domain` 导入 React、Node、DSH 运行时；
- feature 直接导入 `@deepseek-ai/dsh-*` 服务包；
- 在 `LoomPanel` 里直接调用 `ui.remote.*`、`ui.sessions`、`ui.slots`、`ui.layout`；
- 公共 `src/api` 反向 re-export `src/host`。

## 阶段计划

### Phase 0：规范与护栏（0.5–1 天）

交付：

- `docs/typescript-standard.md`；
- 根目录 `AGENTS.md` 指向规范和本计划；
- `CONTRIBUTING.md` 增加模块边界说明；
- 一个轻量 `scripts/check-layers.mjs`（或等价 lint）扫描禁止导入。

验收：

- CI 在出现 `client -> host`、`feature -> DSH 服务` 的导入时失败；
- 现有代码可以暂时通过白名单，但白名单只能缩小，不能扩大。

### Phase 1：DSH 适配层（1–2 天，优先）

交付：

1. `src/api/`：从 `src/types.ts` 移出公共请求/响应类型；
2. `src/ports/dsh-client.ts`：
   - snapshot 读取；
   - session retain/fork/create；
   - workspaces create；
   - slots/layout/sidebar 路由；
   - jobs 读取；
   - native file open；
3. `src/ports/dsh-host.ts`：
   - 所有 `@Remote` 方法的客户端出口；
4. `src/platform/dsh/`：
   - dsh client adapter；
   - host adapter；
   - sidebar `openResource` monkey patch 的封装；
   - DSH 类型转换；
5. `tests/contracts/`：
   - fake DSH client；
   - 快照读取、session fork、sidebar 路由、Remote 错误路径；
6. `src/client/index.ts` 和 `LoomPanel` 不再直接依赖 DSH 服务。

验收：

- grep 检查 `src/client` 中不再出现 DSH 服务包的运行时导入；
- DSH 侧仅 `platform/dsh` 允许具体依赖；
- 正常插件启动、会话、fork、预览、设置全部通过现有测试；
- 增加一个“升级 smoke”：替换 fake port 后，页面仍能渲染。

### Phase 2：Host 拆分（2–3 天）

拆分 `src/host/catalog.ts`：

```text
catalog/schema.ts       记录类型与迁移
catalog/store.ts        JSON 持久化与事务
catalog/workspace-git.ts  worktree / 分支 / 清理
catalog/execution.ts    执行权与队列
catalog/tasks.ts        任务与验收状态
```

拆分 `src/host/service.ts`：

```text
host/rpc/              Remote 请求校验
host/use-cases/        project/version/task/workspace/execution
host/lifecycle/        Session 生命周期与上下文注册
```

验收：

- 单个模块不超过 500 行；
- 新增用例不修改 `LoomService` 以外的大文件；
- 领域测试不依赖文件系统；
- Host 用例测试不依赖真实 DSH。

### Phase 3：客户端拆分（2–4 天）

- 把 `LoomPanel` 拆为 `shell/LoomShell`、`Topbar`、`ProjectTree`、`SessionSidebar`、`WorkbenchLayout`、`Resizers`；
- `LoomForms` 按 feature 拆分；
- `client` 文件移动到 `features/<feature>/`；
- 抽 `ui/primitives.ts`，feature 不直接导入 DSH UI primitives；
- 抽 `ui/tokens.ts`，禁止新增硬编码颜色；
- 测试目录与 feature 镜像。

验收：

- 新组件不超过 250 行，单文件状态数超过 8 个时必须拆分；
- 新增页面/区块无需修改 `LoomPanel`；
- 组件测试只依赖 props 和 feature 内部模块。

### Phase 4：扩展点与升级演练（1–2 天）

- 定义 `LoomFeature` 注册入口；
- 把 task detail、version detail、bottom panel 的区块变成可注册 feature；
- 写一份 DSH upgrade checklist；
- 用 fake DSH 0.3 接口做一次演练。

## DSH 升级标准流程

1. 升级 `@deepseek-ai/dsh-*` 版本；
2. 只运行 `platform/dsh` 和 contracts 测试；
3. 修复适配层，不改 domain/app；
4. 运行 `pnpm run typecheck && pnpm test && pnpm run build`；
5. 在真实 DSH 上验证启动、会话、fork、预览、执行权；
6. 更新兼容性说明。

完成 Phase 1 后，DSH 0.3 的 breaking change 预期只影响：

```text
src/platform/dsh/*
src/client/ui/*
加上少量类型重新生成
```

不再需要全仓库搜改。

## 风险与不做的事

- 不在本计划中修改业务语义；
- 不重写 domain 模型；
- 不新增功能；
- 不为了抽象而抽象：只有跨 DSH 边界的能力才进 `ports/platform`；
- 不把 `LoomPanel` 一次性大爆炸重写，按 feature 逐块迁移。

## 第一件要做的事

Phase 1 的 `src/ports` + `src/platform/dsh` + `src/api` 拆分。

完成后，再决定是否拆 `LoomPanel`；不要先拆 UI。

## Phase 3 进度（2026-11-07）

已完成的第一批客户端拆分：

- 新增 `src/client/features/`，首批迁移 5 个功能域：`settings/`、`palette/`、`overview/`、`project/`、`board/`（含 board 投影与证据纯函数）；
- 新增 `src/client/ui/primitives.ts` 作为 feature 层访问 DSH UI primitives 的唯一入口；ui 与 features 已切换到该入口；
- 新增 `tests/layers.spec.ts`：阻止 feature 直接 import `@deepseek-ai/dsh-client-ui-primitives`，以及除 `dsh-session/types` 外的 DSH 运行时导入；
- 迁移为纯移动 + 导入解析，行为不变：全量 77 files / 448 tests 通过，截图与基线自比 0.00%，lint 零裸值；
- `src/client` 中直接 import DSH 包的文件从 45 降到 37。

剩余 Phase 3 工作：

- 继续迁移 feature 文件（task/session/preview/settings 之外的部分、forms 按 feature 拆分）；
- 拆分 `LoomPanel` 为 shell/ProjectTree/SessionSidebar/WorkbenchLayout/Resizers：已完成 `shell/LoomSidebar.tsx` + `shell/ProjectTree.tsx`，LoomPanel 1328 → 847 行（LoomSidebar/ProjectTree、全局样式、NextStepCard、FormDialogs、LoomRouteContent 已抽出；theme/route/viewport/preferences/pins/menu/board-filters/dialog/presets/diff-count 均已 hook 化；下一步预览右栏与底部栏接线）；
- 拆分 `LoomForms` 完成：`features/forms/`（styles / drafts / FailureNotice / types / fields）承接共享层，ProjectForm/ImportProjectForm 移入 `features/project/`，VersionForm/LockButton 移入 `features/version/`，TaskForm 移入 `features/task/`；LoomForms 变为 12 行 barrel，原 1356 行拆成 1121 行 feature 模块；
- `ui/tokens.ts` 与测试目录按 feature 镜像。
