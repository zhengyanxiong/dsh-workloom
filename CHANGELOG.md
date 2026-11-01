# Changelog

All notable changes to `dsh-workloom` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Workloom is
an early preview, so minor versions may still change the catalog format.
Releases start at 0.1.8 in this repository.

## [Unreleased]

## [0.2.0] - 2026-11-01

Workloom V2: versions own Locks and workspaces, tasks only select a workspace,
and execution rights belong to a Session instead of a turn.

### Added

- V2 data model: projects contain sub-projects; versions carry per-repository
  targets and immutable Lock entries; workspaces belong to a version and are
  either created automatically on branches or linked from existing directories.
- Version creation wizard (name, sub-project refs, workspace, preview) with a
  Lock preview, and a task form that selects one ready workspace instead of
  creating one.
- Workspace lifecycle with preparation status and retry, cleanup that only
  unregisters direct and linked directories, and automatic layout under
  `<subProjectSlug>/<repoPath>`.
- Per-workspace execution gate: FIFO queue, owner card, takeover, and
  session-scoped queue actions (select, continue, leave, reorder).
- Agent takeover through the native approval prompt (`loom_request_takeover`):
  the human confirms before the previous owner is stopped.
- Task workbench session view: sessions grouped by task with owner, queue,
  running and fork state, plus session management in the task detail.
- Execution activity card: an ECG-shaped trace of the owner Session's read and
  write token rates, where the beat height and rhythm follow those rates.
- Settings: two startup switches ("open Workloom after DSH loads", "collapse
  the native left sidebar on load"); the project tree now starts collapsed.

### Changed

- Execution rights are Session-scoped: a Session keeps its workspace across
  turns and gives it back only when the user releases it or the Session is
  disposed; disposing the owner promotes the queue head.
- A running turn claims a free workspace when it starts, and the catalog
  snapshot polls every 1.2s while a bound Session runs (5s otherwise), so the
  owner appears promptly instead of after a poll.
- The activity trace draws only for a real owner, resolves theme tokens on the
  card (including body-declared alias tokens), repaints on palette changes, and
  batches its strokes instead of one per pixel column.
- Task execution shows sessions instead of execution rounds; starting a task
  uses its selected workspace directly.

### Fixed

- The execution gate only gates sessions bound to a task round and honors
  legacy direct workspace status.
- Continuing a session continues the selected task session, not the latest
  bound one.
- Large workspace diffs are read without failing on the child process buffer.
- Deleting a task keeps a workspace that another task still references.
- A catalog write failure names its cause next to the file path.
- Version editing keeps the version targets, failed version creation rolls back
  its Lock and workspaces, and linked workspaces no longer collide on path.
- A Lock stays valid when a version later gains a repository, and workspace
  dirtiness is checked against the working tree rather than the Lock baseline.
- Cleaning a direct or linked workspace only unregisters it and no longer
  requires a clean tree or pushed commits; managed workspaces keep those guards.

### Removed

- Automatic release of execution rights at the end of every Agent turn.
- The numeric token counter and the execution-round history lists in the
  execution card and task detail.

## [0.1.8] - 2026-10-22

### Added

- Native file previews inside the workbench: Markdown, images, code with
  syntax highlighting, open-with/default-app actions and page-level fullscreen.
- Diff tree that reads one directory level at a time and renders inline diffs
  instead of loading every changed file up front.
- A lightweight `workspaceChangeCount` Host remote so the workbench can show
  change counts without loading full diffs.
- Context panel split into the version baseline and the workspace branches, with
  session skills read from the native DSH skill catalog.
- Filterable branch picker with arrow keys, Escape and Enter.
- Host skill-link aggregation under `<root>/.dsh/skills` for direct multi-repo
  workspaces, with cleanup when tasks go away.

### Changed

- The plugin now lives in its own repository and is self-contained: it
  installs, typechecks, tests and builds from its own checkout, with Harness
  packages resolved from npm.
- Git C-quoted paths are decoded before they reach the UI.

### Fixed

- Preview comparisons scroll and wrap correctly in narrow panels.
- The workspace-mode picker highlights the selected mode instead of its
  neighbours.
- A direct workspace stays single-use and only starts from a clean tree.
