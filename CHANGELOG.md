# Changelog

All notable changes to `dsh-workloom` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Workloom is
an early preview, so minor versions may still change the catalog format.
Releases start at 0.1.8 in this repository.

## [Unreleased]

### Added

- Session archive and restore for every Loom Session list: rows hide by default
  once archived, a per-list toggle reveals them with their count, and archiving
  a running Session asks before stopping its work. Execution owners and queued
  Sessions must release access first.

## [0.3.0] - 2026-11-08

### Added

- A reworked workbench shell: Overview, Kanban, task document, native Session,
  project and Settings routes, plus four themes (Paper, White, Blue, Dark) with
  a Follow DSH mode, density, body-size and reduced-motion controls.
- Project pages, version details and version context with Lock history, task
  occupancy and session round cards.
- Task workspace selection can reuse a ready workspace, create a managed
  worktree with editable branch prefix/name, or register an existing directory
  as a direct workspace without copying files.
- Per-task Agent preset overrides that survive the Remote boundary and apply to
  Sessions created for that task.
- The bottom session dock is bound to the active task and supports releasing
  execution, joining the wait queue, leaving it and acquiring access inline.
- Lock repository commit timestamps, including startup backfill for catalogs
  created before the field existed.
- Ctrl/Cmd+K command palette, project/session summaries and README screenshots.

### Changed

- The Host, domain, platform and client layers are split into modules; the
  shell state, forms, sidebar, route content and feature domains no longer live
  in one `LoomPanel`.
- Workspace branch names are sanitized to valid ASCII Git names derived from the
  workspace label.
- On compact widths the context rail, its resizer and its top-bar toggle are
  hidden so the main column stays readable.
- Generated Typert schemas carry workspace selection, Agent preset and commit
  timestamp fields across the Remote boundary.

### Fixed

- Creating a task no longer loses the selected workspace when the task record or
  snapshot arrives asynchronously; the start form adopts the task workspace.
- Cleaning a workspace after its Lock baseline advanced no longer reports old
  baseline commits as unpushed or uncommitted workspace changes.
- Unicode workspace names no longer produce invalid Git branches or a misleading
  “existing code directory is invalid” error.
- The Paper-theme context rail uses the same side-panel surface as the left
  sidebar, and version baselines show the pinned commit time.
- Workspace creation and directory registration no longer reset the open task
  form when the catalog snapshot refreshes.

## [0.2.1] - 2026-11-02

### Added

- Excel workbook preview in the file aside: reads real `.xlsx` bytes, switches
  between worksheets, preserves Chinese text and numeric amounts, and renders
  cached formula values instead of formula text.
- One native split open control for file previews and workspace folders: the
  default application opens from the main button and the menu lists registered
  handlers with icons plus "Show in folder".
- Workspace open menu now merges Windows file handlers discovered from a real
  workspace probe file, so WSL installations expose IntelliJ IDEA, PyCharm,
  DataGrip and Visual Studio Code alongside the directory catalog.
- Right-click-free version and task actions on hover in the project tree:
  version edit/new task/delete and task edit/delete.

### Changed

- Workloom follows the selected DSH light/dark theme through
  `body[data-ds-dark-theme]` instead of the operating-system color scheme.
- The settings modal and New menu were rebuilt with grouped cards, custom
  selects, switches and clearer disabled states.
- The left project sidebar and its pinned/project/session sections can be
  collapsed independently; the new-header button hides the complete sidebar.
- File previews now use the shared split open control instead of three separate
  text actions.
- Version detail actions share one baseline, and the Lock button no longer
  offsets itself from Edit version and New task.
- Workspace open requests report a visible failure or success notice instead of
  silently disappearing.

### Fixed

- WSL Windows file-association queries submit a compressed encoded PowerShell
  command because Windows PowerShell cannot read Linux `-File` temp paths.
- Selecting a workspace application updates the split button immediately,
  including when browser storage is unavailable.

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
