/** Browser-local Loom preferences with debounced persistence. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { readPreferences, writePreferences, type LoomPreferences } from '../features/settings/LoomSettings.tsx'

/**
 * Read the stored preferences and persist changes after a short delay.
 * @returns the preference value and its setter.
 */
export function useLoomPreferences(): readonly [LoomPreferences, Dispatch<SetStateAction<LoomPreferences>>] {
  const [preferences, setPreferences] = useState<LoomPreferences>(readPreferences)
  useEffect(() => {
    const timeout = setTimeout(() => writePreferences(preferences), 120)
    return () => clearTimeout(timeout)
  }, [preferences])
  return [preferences, setPreferences] as const
}
