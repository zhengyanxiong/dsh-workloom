# Workloom Capability Layer 第一阶段实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Loom 内实现通用 Extension Host，使 Profile 配置、Task enabled 覆盖、可信 Session→Task policy、一次激活、能力过滤和统一释放可由 fake extension 验证。

**Architecture:** `src/api/extensions.ts` 保存不依赖 DSH 运行时的公共类型。`src/platform/dsh/extension-host.ts` 持有注册表、Profile config、Session binding、TaskExtensionPolicy、activation disposer 和受限 capability registry；Extension 在 Loom 生命周期内激活一次，Task policy 在每个读取/调用点执行。`ConversationEmbed` 只消费通用 extension visibility，不判断具体 extension id。

**Tech Stack:** TypeScript strict mode, Cordis effect/disposer conventions, React 18, Vitest, existing DSH client slot/session types.

---

## 文件结构与边界

- Create: `src/api/extensions.ts` — branded ids、Profile/Task config、definition、policy、capability 与受控 API descriptor。
- Modify: `src/api/index.ts` — 导出 extension public types。
- Create: `src/platform/dsh/extension-host.ts` — 纯 Loom-owned host；不暴露任意 DSH context，集中处理 policy 和 activation。
- Create: `src/platform/dsh/extension-host.spec.ts` — fake extension 的 unit/contract tests。
- Modify: `src/platform/dsh/client-surface.ts` — 为 conversation view roster 保留 extension metadata，并由 host visibility 过滤当前 Session。
- Modify: `src/client/features/session/ConversationEmbed.tsx` — 依据通用可见 view roster 和当前 session 重算 tabs/activeView。
- Create or modify: 对应 Session UI test file — 覆盖 missing/disabled/enabled view 及 Session 切换。
- Modify: `src/platform/dsh/client-plugin.ts` 或现有 Host bootstrap — 在 Loom DSH context 中创建并 effect-dispose Extension Host；只接入 fake-compatible generic registry，不安装新 Profile 插件。
- Create: `docs/superpowers/plans/2026-11-18-capability-layer-plan.md` — 本计划。

## Task 1: Public extension contracts

**Files:**
- Create: `src/api/extensions.ts`
- Modify: `src/api/index.ts`
- Test: `src/platform/dsh/extension-host.spec.ts` type-level usage in later task

- [ ] **Step 1: Add the failing contract import test**

Create the first test import in `src/platform/dsh/extension-host.spec.ts` with a fake definition using `LoomExtensionDefinition`, `LoomExtensionProfileConfig`, `LoomExtensionTaskConfig`, `ExtensionCapability`, and `TaskExtensionPolicy`; the test should initially fail because `src/api/extensions.ts` does not exist.

- [ ] **Step 2: Run the focused test**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts`
Expected: FAIL during module resolution for `../api/extensions.ts`.

- [ ] **Step 3: Implement the public types**

Define branded ids with `Branded`, separate Profile and Task config interfaces, `LoomExtensionDefinition`, `LoomExtensionActivation`, `LoomExtensionContext`, `TaskExtensionPolicy`, `ExtensionCapability`, and `ControlledApiDefinition`. Keep Task config limited to `enabled?: boolean | undefined`; do not add a Task config field. Export the module from `src/api/index.ts`.

- [ ] **Step 4: Run typecheck and the focused test**

Run: `pnpm run typecheck && pnpm exec vitest run src/platform/dsh/extension-host.spec.ts`
Expected: typecheck reaches the still-unimplemented host symbols; the test imports compile and fails on the missing host implementation rather than missing public types.

- [ ] **Step 5: Commit**

Run: `git add src/api/extensions.ts src/api/index.ts && git commit -m "feat(workloom): define extension capability contracts"`

## Task 2: Policy resolution and trusted Session binding

**Files:**
- Modify: `src/platform/dsh/extension-host.ts`
- Test: `src/platform/dsh/extension-host.spec.ts`

- [ ] **Step 1: Write failing policy tests**

Cover these cases with branded test ids: Profile false + no Task override resolves false; Profile true + no Task override resolves true; Task false overrides Profile true; Task config field is rejected; unknown extension id, malformed enabled value, unbound Session, and mismatched request identity throw structured policy errors.

- [ ] **Step 2: Run tests and verify expected failures**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts -t "policy"`
Expected: FAIL because `createLoomExtensionHost` and policy resolution do not exist.

- [ ] **Step 3: Implement minimal host and policy**

Implement `createLoomExtensionHost()` with registration map, trusted `bindSession`, profile validation, task switch resolution, `visible()`, and `assertEnabled()`; derive task identity only from the binding. Use structured error classes/codes for `extension_unavailable`, `session_unbound`, `extension_disabled`, `invalid_config`, and `identity_mismatch`. Do not trust caller-provided task/session ids after binding.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts -t "policy"`
Expected: all policy cases pass.

- [ ] **Step 5: Commit**

Run: `git add src/platform/dsh/extension-host.ts src/platform/dsh/extension-host.spec.ts && git commit -m "feat(workloom): enforce task extension policy"`

## Task 3: Single activation and contribution lifecycle

**Files:**
- Modify: `src/platform/dsh/extension-host.ts`
- Test: `src/platform/dsh/extension-host.spec.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create a fake extension whose `activate()` registers service, tool, projection, controlled API, and UI capabilities and increments an activation counter. Assert two enabled Tasks activate once, retries do not duplicate contribution names, disabled Tasks receive no visible contribution and cannot invoke the controlled API, and `dispose()` invokes every returned disposer exactly once.

- [ ] **Step 2: Run the lifecycle tests**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts -t "activation|dispose|contribution"`
Expected: FAIL because activation and capability registry are not implemented.

- [ ] **Step 3: Implement activation registry**

Add a Loom-owned activation record per registered extension, lazy activation on first enabled policy, contribution registration that tags every entry with `extensionId`, per-session filtering helpers for services/tools/projections/APIs/UI, and reverse-order disposer cleanup. Registration collisions and activation failures must roll back all contributions from that activation.

- [ ] **Step 4: Run lifecycle tests and typecheck**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts -t "activation|dispose|contribution" && pnpm run typecheck`
Expected: focused lifecycle tests and all three TypeScript programs pass.

- [ ] **Step 5: Commit**

Run: `git add src/platform/dsh/extension-host.ts src/platform/dsh/extension-host.spec.ts && git commit -m "feat(workloom): manage extension activation lifecycle"`

## Checkpoint: Host core

- [ ] Policy, activation, contribution filtering, and disposal tests pass.
- [ ] `pnpm run typecheck` passes.
- [ ] No DSH repository files, Profile files, plugin installation records, or Ouroboros code changed.

## Task 4: Generic client view filtering

**Files:**
- Modify: `src/platform/dsh/client-surface.ts`
- Modify: `src/client/features/session/ConversationEmbed.tsx`
- Test: existing ConversationEmbed test or new focused test beside the component

- [ ] **Step 1: Inspect existing ConversationEmbed test harness and add failing cases**

Add cases where the extension view is absent when the current Session has no bound enabled policy, absent when policy is false, present when policy is true, and removed/recomputed when the Session changes. Keep the test data generic: use `extensionId: 'fake-extension'`, never `api-testing`.

- [ ] **Step 2: Run the focused UI test**

Run: `pnpm exec vitest run <ConversationEmbed-test-file>`
Expected: FAIL because the view roster has no generic policy metadata/filter.

- [ ] **Step 3: Implement generic filtering**

Extend the internal `ViewTab` adapter record with optional extension metadata and pass a session-aware filtered roster into `ConversationEmbed`. Filter before selecting `activeView`; if the preferred view becomes unavailable, fall back to Chat, then first visible tab. Do not import Host implementation into the client.

- [ ] **Step 4: Run focused UI tests and typecheck**

Run: `pnpm exec vitest run <ConversationEmbed-test-file> && pnpm run typecheck`
Expected: all view filtering cases pass and client typecheck passes.

- [ ] **Step 5: Commit**

Run: `git add src/platform/dsh/client-surface.ts src/client/features/session/ConversationEmbed.tsx <ConversationEmbed-test-file> && git commit -m "feat(workloom): filter extension conversation views"`

## Task 5: Loom bootstrap and fake extension integration

**Files:**
- Modify: `src/platform/dsh/client-plugin.ts` or the confirmed Host bootstrap module
- Modify: `src/host/service.ts` only if Session→Task binding must be registered at Session admission
- Test: `tests/contracts/extension-host.spec.ts` or `src/platform/dsh/extension-host.spec.ts`

- [ ] **Step 1: Add failing bootstrap contract test**

Use a fake Loom context and assert that Host startup constructs one Extension Host, binds a Session to its Task, and disposal releases it; repeated startup/reload does not leave stale contribution entries.

- [ ] **Step 2: Run the bootstrap test**

Run: `pnpm exec vitest run <bootstrap-test-file>`
Expected: FAIL because the current bootstrap does not own the generic host.

- [ ] **Step 3: Integrate lifecycle ownership**

Create the Extension Host once from the Loom bootstrap, register it through `ctx.effect()`, and bind Session→Task only after Loom’s trusted task admission path. Avoid changing the DSH agent loop or adding a second runtime. If current persisted Task records lack extension config, keep config in the new host input and do not alter catalog persistence in this phase.

- [ ] **Step 4: Run focused integration checks**

Run: `pnpm exec vitest run <bootstrap-test-file> src/platform/dsh/extension-host.spec.ts && pnpm run typecheck`
Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Commit**

Run: `git add <bootstrap-files> <test-files> && git commit -m "feat(workloom): mount capability host in Loom"`

## Task 6: Verification and isolated-port smoke

**Files:**
- Modify: `scripts/smoke.mjs` only if it cannot accept an isolated port; preserve default behavior.
- Test artifacts: `.loomtmp/capability-layer/` only; never commit.

- [ ] **Step 1: Run focused and repository checks**

Run: `pnpm exec vitest run src/platform/dsh/extension-host.spec.ts <ConversationEmbed-test-file> && pnpm run typecheck && pnpm run build`
Expected: exit code 0 for all commands.

- [ ] **Step 2: Run Loom smoke on a new port**

Use the existing smoke command with an explicit isolated port, preferably `3090` as documented by `AGENTS.md`, for example `pnpm run smoke -- --port 3090` if supported; otherwise inspect `scripts/smoke.mjs` and invoke its documented port flag. Store logs under `.loomtmp/capability-layer/`. Do not stop or restart `http://127.0.0.1:3080`.

- [ ] **Step 3: Audit scope and Git diff**

Run: `git status --short`, `git diff --check`, and `git diff --stat`; verify only Loom implementation/docs/tests changed and the pre-existing README/architecture assets remain untouched.

- [ ] **Step 4: Final review**

Read the final diff, re-run the focused tests after the last edit, and report exact commands, exit codes, remaining risks, and the fact that no DSH files/Profile/plugin/Ouroboros were modified.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Current DSH slots do not carry extension metadata | High | Keep metadata in Loom adapter records and filter before rendering; do not special-case API Testing. |
| Existing Task records have no extension config | High | Keep policy input separate from catalog persistence in Phase 1; add persistence only after an explicit migration design. |
| Session→Task binding is not available at client bootstrap | High | Bind only at trusted Host admission; fail closed when absent. |
| Extension activation registration leaks on errors | High | Register contributions transactionally and unwind in reverse order on activation failure/dispose. |
| Smoke script port behavior differs | Medium | Read the script before invoking and use `.loomtmp`; never touch port 3080. |
