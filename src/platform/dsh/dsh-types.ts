/**
 * DSH module augmentations required by Workloom's native surfaces.
 *
 * Keeping these declarations here prevents registration and host-adapter code
 * from depending on each other's module side effects.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileBytes, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { LoomKey } from '../../client/locales.ts'

/**
 * The workspace-files read this bundle calls through the native Remote carrier.
 */
export interface WorkspaceFilesFace {
  read(sessionId: SessionId, path: string, range: { readonly offset: number }, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileText>>
  readBytes(sessionId: SessionId, path: string, options: Record<string, never>, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileBytes>>
}

/**
 * One native Agent preset as the project form offers it.
 */
export interface AgentPresetRowFace {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

/**
 * The Agent-preset roster read used by Workloom project settings.
 */
export interface AgentPresetsFace {
  list(): Promise<RemoteResult<{ presets: readonly AgentPresetRowFace[] }>>
}

/**
 * The right-Sidebar navigation method this bundle decorates while Loom is on screen.
 */
export interface SidebarRightFace {
  openResource(address: string, options?: unknown): void
}

declare module '@deepseek-ai/dsh-api-gateway/client' {
  interface ClientRemote {
    /**
     * Native workspace file reads, used by the Loom preview.
     */
    readonly workspaceFiles: WorkspaceFilesFace
    /**
     * Native Agent-preset roster, used by project settings.
     */
    readonly agentPresets: AgentPresetsFace
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Right-Sidebar navigation face; only the method Loom forwards is named here.
     */
    sidebarRight: SidebarRightFace
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { loom: LoomKey }
  interface SlotMap {
    /**
     * Native conversation hosted by Loom's explicit SessionProvider.
     */
    'loom.conversation': { kind: 'single'; scope: 'session' }
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { loom: unknown }
}
