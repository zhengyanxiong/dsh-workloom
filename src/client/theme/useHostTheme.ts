/** Keep Loom's dark flag and the DSH host theme in sync with the Loom preference. */
import { useEffect, useRef, useState } from 'react'
import { resolveLoomTheme, type LoomThemePreference } from './selection.ts'

/**
 * Track the host dark theme and retheme DSH chrome for explicit Loom themes.
 * @param theme - current Loom theme preference.
 * @returns whether the host currently renders dark.
 */
export function useHostTheme(theme: LoomThemePreference): boolean {
  const [darkTheme, setDarkTheme] = useState(() => typeof document === 'undefined' ? false : document.body.hasAttribute('data-ds-dark-theme'))
  const originalHostDark = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    if (theme === 'auto') {
      if (originalHostDark.current !== undefined) {
        if (body.hasAttribute('data-ds-dark-theme') !== originalHostDark.current) body.toggleAttribute('data-ds-dark-theme', originalHostDark.current)
        originalHostDark.current = undefined
      }
      return
    }
    if (originalHostDark.current === undefined) originalHostDark.current = body.hasAttribute('data-ds-dark-theme')
    const wantDark = resolveLoomTheme(theme, false) === 'dark'
    if (body.hasAttribute('data-ds-dark-theme') !== wantDark) body.toggleAttribute('data-ds-dark-theme', wantDark)
  }, [theme])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const sync = (): void => setDarkTheme(body.hasAttribute('data-ds-dark-theme'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return darkTheme
}
