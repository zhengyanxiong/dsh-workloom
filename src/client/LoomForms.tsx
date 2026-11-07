/** Inline creation and edit forms for Loom projects, versions and tasks. */
export type { AgentPresetOption } from '../api/agent.ts'
export { BranchPicker } from './features/forms/fields.tsx'
export { ImportProjectForm, parseImport, type ImportProjectResult } from './features/project/ImportProjectForm.tsx'
export { ProjectForm } from './features/project/ProjectForm.tsx'
export { LockButton } from './features/version/LockButton.tsx'
export { VersionForm, type VersionStep } from './features/version/VersionForm.tsx'
export { TaskForm } from './features/task/TaskForm.tsx'
export {
  emptyModuleRow, emptySourceRow, sourceIds, sourcePathsOverlap, projectRequest, versionRequest, taskRequest, workspaceDraftInput,
} from './features/forms/drafts.ts'
export type { ModuleDraft, SourceDraft, TaskMetadataDraft } from './features/forms/drafts.ts'
