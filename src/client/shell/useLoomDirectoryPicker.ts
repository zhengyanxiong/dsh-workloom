/**
 * Directory picker fallback used by workspace forms.
 *
 * Prefer the native directory picker; when it is unavailable or throws, fall
 * back to the in-app browser and resolve the pending form request with the
 * chosen path (or null on cancel).
 */
import { useRef, useState } from 'react'

/** One pending in-app directory browser request. */
export interface LoomDirectoryRequest {
  readonly startPath?: string
}

/** Directory picker surface consumed by the shell. */
export interface LoomDirectoryPicker {
  readonly directoryRequest: LoomDirectoryRequest | undefined
  readonly finishDirectory: (value: string | null) => void
  readonly openDirectoryBrowser: (startPath?: string) => Promise<string | null>
  readonly chooseDirectory: (startPath?: string) => Promise<string | null>
}

/**
 * Own the native/in-app directory picker fallback.
 *
 * @param pickDirectory - native picker port; may reject when unsupported.
 * @returns the pending request and picker actions.
 */
export function useLoomDirectoryPicker(pickDirectory: () => Promise<string | null>): LoomDirectoryPicker {
  const [directoryRequest, setDirectoryRequest] = useState<LoomDirectoryRequest>()
  const resolveRef = useRef<((value: string | null) => void) | undefined>(undefined)
  const finishDirectory = (value: string | null): void => {
    const resolve = resolveRef.current
    resolveRef.current = undefined
    setDirectoryRequest(undefined)
    resolve?.(value)
  }
  const openDirectoryBrowser = (startPath?: string): Promise<string | null> => {
    resolveRef.current?.(null)
    return new Promise(resolve => {
      resolveRef.current = resolve
      setDirectoryRequest(startPath === undefined ? {} : { startPath })
    })
  }
  const chooseDirectory = async (startPath?: string): Promise<string | null> => {
    try {
      const picked = await pickDirectory()
      return picked === null ? null : picked
    } catch {
      return openDirectoryBrowser(startPath)
    }
  }
  return { directoryRequest, finishDirectory, openDirectoryBrowser, chooseDirectory }
}
