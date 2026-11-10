/**
 * Ephemeral shell chrome state: sidebar visibility, palette, search and the
 * temporary-Session dialog. None of these values belong in the Host catalog.
 */
import { useEffect, useState } from 'react'

/** Inputs for {@link useLoomChromeState}. */
export interface LoomChromeStateInput {
  readonly project: string | undefined
  readonly version: string | undefined
  readonly task: unknown
}

/** Shell chrome state and setters. */
export interface LoomChromeState {
  readonly sidebarOpen: boolean
  readonly setSidebarOpen: (update: boolean | ((current: boolean) => boolean)) => void
  readonly sidebarCollapsed: boolean
  readonly setSidebarCollapsed: (update: boolean | ((current: boolean) => boolean)) => void
  readonly paletteOpen: boolean
  readonly setPaletteOpen: (update: boolean | ((current: boolean) => boolean)) => void
  readonly search: string
  readonly setSearch: (value: string) => void
  readonly temporaryOpen: boolean
  readonly setTemporaryOpen: (update: boolean | ((current: boolean) => boolean)) => void
}

/**
 * Own the shell's ephemeral overlay/sidebar state.
 *
 * @param input - current selection; changing it closes the mobile sidebar.
 * @returns chrome state and setters.
 */
export function useLoomChromeState(input: LoomChromeStateInput): LoomChromeState {
  const { project, version, task } = input
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [temporaryOpen, setTemporaryOpen] = useState(false)
  useEffect(() => { setSidebarOpen(false) }, [project, version, task])
  return { sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed, paletteOpen, setPaletteOpen, search, setSearch, temporaryOpen, setTemporaryOpen }
}
