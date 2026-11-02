# AGENTS.md

Workloom repository instructions for agents and contributors.

Read these before changing code:

- [TYPESCRIPT.md](TYPESCRIPT.md) — mandatory TypeScript,
  module-boundary, testing and UI rules.
- [ARCHITECTURE.md](ARCHITECTURE.md) — target
  module layout and migration phases.

## Non-negotiable rules

- `src/domain` stays free of React, Node and DSH runtime imports.
- `src/client` must not import `src/host` implementation modules.
- Only `src/platform/dsh` may import `@deepseek-ai/dsh-*` service packages.
- Feature code reaches DSH through `src/ports` and `src/platform/dsh`, never through
  `ui.remote.*`, `ui.sessions`, `ui.slots` or `ui.layout` directly.
- Public wire types live in `src/api`; `src/types.ts` must not re-export
  `src/host/catalog.ts`.
- Keep strict TypeScript. No new `any`, `@ts-ignore`, or unvalidated `as` casts.
- New files should stay under 300 lines; split before 500. Do not grow
  `LoomPanel`, `LoomForms`, `catalog` or `service`.
- New user-visible copy goes through locale dictionaries.
- Use existing UI tokens/primitives; do not add hardcoded colors or copy.
- Every behavior change needs a focused test; DSH boundary changes need a contract
  test.
- Run `pnpm run typecheck`, `pnpm test` and `pnpm run build` before claiming done.
- Commit messages use Conventional Commits with the `workloom` scope.

## Migration rule

The standard applies to all new and modified code. Existing exceptions are listed
in review and must shrink; do not propagate them into new modules.
