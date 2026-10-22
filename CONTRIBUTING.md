# Contributing

Thanks for helping improve Workloom. This document covers the local setup, the
checks a change must pass, and the rules that keep the plugin compatible with
DeepSeek Harness.

## Requirements

- Node.js `>=22.19`
- pnpm `11.x` (the repository pins `packageManager`)
- A DeepSeek Harness installation to run the plugin against: `>=0.2.1-rc.2 <0.3.0`

## Setup

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm install` links the published `@deepseek-ai/dsh-*` packages this plugin is
built against. The Harness API is pre-stable, so a version bump of those
packages is a real change: run the full check set afterwards.

The devDependencies also mirror the Web shell's client module table (`shiki`,
`simple-icons`, `zustand`, `immer`, the `mdast-*`/`micromark-*` set and
`jsdom`). Published Harness client packages expect the shell to provide those
modules at runtime, so the Node test environment installs them itself. They are
development-only and never ship in the bundle.

## Checks

| Command | What it covers |
| --- | --- |
| `pnpm run typecheck` | Host, Client and domain programs (`tsconfig.*.json`) |
| `pnpm test` | Unit tests for the domain, Host services and Client components |
| `pnpm run build` | `tsdown` bundle into `lib/` |

CI runs the same three commands through `.github/workflows/ci.yml`.

## Generated artifacts

`lib/typert.host.*` and `lib/typert.remote-client.*` are generated from the
plugin's Host FaceModel and are checked in, because the generator needs a
DeepSeek Harness source checkout to analyze the workspace. Run
`pnpm run generate` from inside that monorepo after changing Host Remote
methods, then commit the regenerated files. Everything else under `lib/` is
build output and is ignored.

## Code style

- TypeScript with the strict settings in `tsconfig.base.json`.
- `.ts` in local relative imports; package names across packages.
- English comments and JSDoc; user-visible copy goes through the locale
  dictionaries in `locale/` and `src/client/locales.ts`.
- Files end with exactly one trailing newline.

## Commit messages

Use Conventional Commits with a `workloom` scope, for example:

```
feat(workloom): read a diff tree one level at a time
fix(workloom): keep the selected workspace mode highlighted
```

## Releasing

`.github/workflows/release.yml` releases on every push to `main`:

1. It reads `version` from `package.json`. If `v<version>` is already tagged, the
   run stops, so a push that does not change the version releases nothing.
2. Otherwise it installs, typechecks, tests and builds, publishes
   `dsh-workloom@<version>` to npm with provenance, pushes the `v<version>` tag
   and opens the GitHub Release.

A release is therefore: bump `version` in `package.json`, add the matching
`CHANGELOG.md` entry, commit and push to `main`.

A run that failed after publishing is safe to retry from Actions → Release →
Run workflow: the tag check skips the npm step, and the Release step only
creates what is missing.

### First-time repository setup

Publishing uses npm Trusted Publishing, so the repository needs no token.
Configure it once on npmjs.com: open the `dsh-workloom` package → Settings →
Trusted Publisher → GitHub Actions and fill in:

- Organization or user: `zhengyanxiong`
- Repository: `dsh-workloom` (the repository name, not a URL)
- Workflow filename: `release.yml`
- Environment name: leave empty
- Allowed actions: check **Allow npm publish**

The connection cannot be edited later, so confirm the repository and workflow
name before submitting. `.github/workflows/release.yml` already requests
`id-token: write` and installs a current npm, which are the two requirements on
the workflow side.

To release with an npm token instead, add an `NPM_TOKEN` Actions secret and put
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` back on the publish step. A token
takes precedence over OIDC, so do not set both.

## License

By contributing you agree that your contributions are licensed under the MIT
License.
