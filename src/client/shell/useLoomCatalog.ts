/**
 * Owns the Host catalog snapshot and its refresh counter.
 *
 * The catalog is loaded once per mount and re-read whenever the attempt counter
 * changes; the previous snapshot stays visible while a refresh runs so the open
 * task form never loses its in-progress state.
 */
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot } from 'dsh-workloom/types'

/** Loadable catalog state; only `ready` carries a snapshot. */
export type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: CatalogSnapshot }

/** Catalog hook surface consumed by the shell. */
export interface LoomCatalog {
  readonly catalog: CatalogState
  readonly snapshot: CatalogSnapshot | undefined
  readonly attempt: number
  readonly setAttempt: Dispatch<SetStateAction<number>>
  readonly setCatalog: Dispatch<SetStateAction<CatalogState>>
}

/**
 * Load and refresh the Host catalog.
 *
 * @param loadSnapshot - Host snapshot loader, stable across the component lifetime.
 * @returns the catalog state, derived snapshot, refresh counter and its setter.
 */
export function useLoomCatalog(loadSnapshot: () => Promise<RemoteResult<CatalogSnapshot>>): LoomCatalog {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    // Keep the current snapshot visible while a refresh runs; clearing it
    // unmounts the open task form and loses its in-progress state.
    setCatalog(current => current.status === 'ready' ? current : { status: 'loading' })
    loadSnapshot().then((result) => {
      if (!active) return
      setCatalog(result.ok ? { status: 'ready', snapshot: result.value } : { status: 'error' })
    }, () => { if (active) setCatalog({ status: 'error' }) })
    return () => { active = false }
  }, [loadSnapshot, attempt])
  const snapshot = catalog.status === 'ready' ? catalog.snapshot : undefined
  return { catalog, snapshot, attempt, setAttempt, setCatalog }
}
