/** Agent preset data rendered by project and task forms. */
export interface AgentPresetOption {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}
