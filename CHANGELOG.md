# Changelog

All notable changes to `dsh-workloom` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Workloom is
an early preview, so minor versions may still change the catalog format.
Releases start at 0.1.8 in this repository.

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
