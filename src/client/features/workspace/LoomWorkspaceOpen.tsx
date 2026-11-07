/** Workspace-directory opener backed by the Host open-in-app catalog and Windows file handlers. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { IconChevronDownOutlineRegular, IconFolderOpenRegular, Menu, type MenuEntry } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { COLORS } from '../../ui/tokens.ts'
import { pushLoomNotice } from '../../shared/feedback.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Native file handler metadata returned by the Session Remote. */
export interface WorkspaceApplication {
  readonly id: string
  readonly name: string
  readonly icon?: string | null | undefined
}

/** Inputs for one workspace path opener. */
export interface LoomWorkspaceOpenProps {
  readonly t: Translate
  /** Absolute workspace directory or repository path. */
  readonly path: string
  /** Native default application fallback when the catalog is unavailable. */
  readonly openPath?: ((path: string) => void) | undefined
  /** Native file-association query; its handlers supplement the directory catalog. */
  readonly applications?: ((path: string, signal: AbortSignal) => Promise<RemoteResult<readonly WorkspaceApplication[]>>) | undefined
  /** Open this directory with one file-associated handler. */
  readonly openWith?: ((path: string, application: string) => Promise<boolean>) | undefined
  /** Existing files whose extensions reveal Windows handlers for development tools. */
  readonly probePaths?: readonly string[] | undefined
}

interface OpenerEntry {
  /** Persisted choice key; catalog entries use the bare app id for native interop. */
  readonly key: string
  readonly label: string
  readonly kind: 'catalog' | 'file'
  readonly launchId: string
  readonly icon?: string | null | undefined
}

const APP_BRANDS: Readonly<Record<string, { readonly short: string; readonly background: string; readonly color: string }>> = {
  vscode: { short: 'VS', background: '#007acc', color: '#fff' },
  vscodeinsiders: { short: 'VS', background: '#24bfa5', color: '#fff' },
  cursor: { short: 'C', background: '#111', color: '#fff' },
  zed: { short: 'Z', background: '#1f2937', color: '#fff' },
  windsurf: { short: 'W', background: '#0f766e', color: '#fff' },
  intellij: { short: 'IJ', background: 'linear-gradient(135deg,#fe315d,#8b5cf6)', color: '#fff' },
  pycharm: { short: 'PC', background: 'linear-gradient(135deg,#21d789,#0f9d58)', color: '#fff' },
  webstorm: { short: 'WS', background: 'linear-gradient(135deg,#07c3f2,#087cbd)', color: '#fff' },
  goland: { short: 'GO', background: 'linear-gradient(135deg,#00add8,#00758f)', color: '#fff' },
  rider: { short: 'R', background: 'linear-gradient(135deg,#f97316,#c2410c)', color: '#fff' },
  rustrover: { short: 'RR', background: 'linear-gradient(135deg,#f74c00,#9a3412)', color: '#fff' },
  androidstudio: { short: 'AS', background: 'linear-gradient(135deg,#3ddc84,#0f9d58)', color: '#fff' },
  xcode: { short: 'X', background: '#147efb', color: '#fff' },
  explorer: { short: 'EX', background: '#f7c948', color: '#332b00' },
  finder: { short: 'F', background: '#2f80ed', color: '#fff' },
  terminal: { short: '>_', background: '#1f2937', color: '#fff' },
  windowsterminal: { short: '>_', background: '#1f2937', color: '#fff' },
}

const APP_LABELS: Readonly<Record<string, string>> = {
  vscode: 'VS Code', vscodeinsiders: 'VS Code Insiders', cursor: 'Cursor', zed: 'Zed', windsurf: 'Windsurf',
  intellij: 'IntelliJ IDEA', pycharm: 'PyCharm', webstorm: 'WebStorm', goland: 'GoLand', rider: 'Rider',
  rustrover: 'RustRover', androidstudio: 'Android Studio', xcode: 'Xcode', sublimetext: 'Sublime Text',
  explorer: '资源管理器', finder: 'Finder', filemanager: '文件管理器',
  terminal: '终端', windowsterminal: 'Windows Terminal', gitbash: 'Git Bash',
  iterm: 'iTerm', warps: 'Warp', warp: 'Warp', kitty: 'kitty', gnometerminal: 'GNOME Terminal', konsole: 'Konsole',
}

/** File handlers that can plausibly open a workspace directory; file-specific viewers are omitted. */
const DIRECTORY_CAPABLE = /(visual studio|vs code|intellij|pycharm|webstorm|goland|rider|rustrover|datagrip|android studio|cursor|zed|sublime|windsurf|fleet|eclipse|vim|emacs)/iu

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 0, minWidth: 0 }
const opener: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 20, border: `0.5px solid ${COLORS.border}`, background: COLORS.panel, padding: 0, color: COLORS.dim, cursor: 'pointer', borderTopLeftRadius: 5, borderBottomLeftRadius: 5 }
const chevron: CSSProperties = { ...opener, width: 15, marginLeft: -0.5, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none', borderTopRightRadius: 5, borderBottomRightRadius: 5 }
const appIcon: CSSProperties = { width: 13, height: 13, objectFit: 'contain', display: 'block', borderRadius: 2 }
const badge: CSSProperties = { display: 'grid', placeItems: 'center', width: 13, height: 13, borderRadius: 3, background: COLORS.panel2, color: COLORS.dim, fontSize: 'var(--text-nano-size)', fontWeight: 600, lineHeight: 1 }
const failure: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-nano-size)', lineHeight: 1.3, maxWidth: 140 }

function appFamily(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z0-9]/gu, '')
  if (name.includes('visualstudiocode') || name.includes('vscode')) return 'vscode'
  if (name.includes('intellij')) return 'intellij'
  if (name.includes('pycharm')) return 'pycharm'
  if (name.includes('webstorm')) return 'webstorm'
  if (name.includes('datagrip')) return 'datagrip'
  if (name.includes('goland')) return 'goland'
  if (name.includes('rustrover')) return 'rustrover'
  if (name.includes('androidstudio')) return 'androidstudio'
  if (name.includes('cursor')) return 'cursor'
  if (name.includes('zed')) return 'zed'
  return name
}

function AppIcon({ id, size = 13, src }: { id: string; size?: number; src?: string | null | undefined }): ReactNode {
  const [failed, setFailed] = useState(false)
  const brand = APP_BRANDS[id]
  if (src !== undefined && src !== null && src !== '' && !failed) {
    return <img src={src} alt="" width={size} height={size} style={appIcon} onError={() => setFailed(true)} />
  }
  if (failed || brand === undefined) {
    return <span style={{ ...badge, width: size, height: size, fontSize: Math.max(6, size - 6), background: brand?.background ?? COLORS.panel2, color: brand?.color ?? COLORS.dim }} aria-hidden>{brand?.short ?? id.slice(0, 2).toUpperCase()}</span>
  }
  return <img src={`open-in-app/icon/${encodeURIComponent(id)}`} alt="" width={size} height={size} style={appIcon} onError={() => setFailed(true)} />
}

function labelFor(id: string): string {
  return APP_LABELS[id] ?? id
}

/**
 * Open a workspace folder in a development tool.
 * The directory catalog supplies Linux/macOS launchers; on WSL its Windows file
 * handlers are merged so installed IDEs such as IntelliJ and PyCharm appear too.
 * The main click uses the remembered choice and falls back to the native opener.
 */
export function LoomWorkspaceOpen({ t, path, openPath, applications, openWith, probePaths = [] }: LoomWorkspaceOpenProps) {
  const [catalogApps, setCatalogApps] = useState<readonly string[] | null>(null)
  const [fileApps, setFileApps] = useState<readonly WorkspaceApplication[]>([])
  const [choice, setChoice] = useState<string>(() => { try { return globalThis.localStorage?.getItem('dsh.open-in-app.choice') ?? '' } catch { return '' } })
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('open-in-app/apps', { headers: { accept: 'application/json' } })
      .then(async response => response.ok ? await response.json() as { apps?: unknown } : undefined)
      .then((payload) => {
        if (cancelled) return
        const ids = Array.isArray(payload?.apps) ? payload.apps.filter((id): id is string => typeof id === 'string') : []
        setCatalogApps(ids)
      })
      .catch(() => { if (!cancelled) setCatalogApps([]) })
    return () => { cancelled = true }
  }, [])
  const probeKey = probePaths.join('|')
  useEffect(() => {
    if (applications === undefined || probeKey === '') { setFileApps([]); return }
    const controller = new AbortController()
    void (async () => {
      for (const probe of probePaths) {
        try {
          const result = await applications(probe, controller.signal)
          if (controller.signal.aborted) return
          if (result.ok && result.value.length > 0) { setFileApps(result.value); return }
        } catch {
          if (controller.signal.aborted) return
        }
      }
      if (!controller.signal.aborted) setFileApps([])
    })()
    return () => { controller.abort() }
    // probePaths is represented by probeKey so callers may pass an inline array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, probeKey])
  const catalogEntries: OpenerEntry[] = (catalogApps ?? []).map(id => ({ key: id, label: labelFor(id), kind: 'catalog', launchId: id }))
  const fileEntries: OpenerEntry[] = fileApps
    .filter(application => DIRECTORY_CAPABLE.test(application.name))
    .map(application => ({ key: `file:${application.id}`, label: application.name, kind: 'file', launchId: application.id, icon: application.icon }))
  const entries = [...catalogEntries]
  for (const entry of fileEntries) {
    if (!entries.some(existing => appFamily(existing.label) === appFamily(entry.label) || existing.launchId === entry.launchId)) entries.push(entry)
  }
  const preferred = entries.find(entry => entry.key === choice)
    ?? entries.find(entry => entry.kind === 'catalog' && choice === entry.launchId)
    ?? entries[0]
  async function launch(entry: OpenerEntry | undefined): Promise<void> {
    setFailed(false)
    if (entry === undefined) {
      if (openPath !== undefined) openPath(path)
      return
    }
    setBusy(true)
    try {
      if (entry.kind === 'catalog') {
        const response = await fetch('open-in-app/open', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: entry.launchId, path }),
        })
        if (!response.ok) { setFailed(true); return }
      } else {
        if (openWith === undefined) { setFailed(true); return }
        // Windows Shell validates handlers against the target path; a directory has no
        // file association. Probe an existing workspace file first so the IDE opens the
        // project context without a failed directory launch; the directory remains the
        // fallback for hosts that can hand a folder to a file-associated application.
        let opened = false
        for (const probe of probePaths) {
          try {
            if (await openWith(probe, entry.launchId)) { opened = true; break }
          } catch {
            // Try the next probe; the directory fallback below reports the final failure.
          }
        }
        if (!opened) {
          try { opened = await openWith(path, entry.launchId) } catch { opened = false }
        }
        if (!opened) { setFailed(true); pushLoomNotice('error', t('workspace.openFailed'), entry.label); return }
      }
      setChoice(entry.key)
      try { globalThis.localStorage?.setItem('dsh.open-in-app.choice', entry.key) } catch { /* storage can be unavailable */ }
      pushLoomNotice('success', t('workspace.opened', { app: entry.label }))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const menuEntries: MenuEntry[] = entries.map(entry => ({
    id: entry.key,
    label: entry.label,
    icon: <AppIcon id={entry.kind === 'catalog' ? entry.launchId : entry.label} src={entry.icon} />,
  }))
  const icon = preferred === undefined
    ? <IconFolderOpenRegular size={13} />
    : <AppIcon id={preferred.kind === 'catalog' ? preferred.launchId : preferred.label} src={preferred.icon} />
  return <div style={row}>
    <button type="button" style={{ ...opener, opacity: busy ? 0.55 : 1 }} aria-busy={busy} aria-label={preferred === undefined ? t('ctx.open') : `${t('ctx.open')} · ${preferred.label}`}
      title={preferred === undefined ? path : `${t('ctx.open')} · ${preferred.label}`} disabled={busy}
      onClick={() => { void launch(preferred) }}>{icon}</button>
    {entries.length > 1 && <Menu open={menuOpen} onClose={() => setMenuOpen(false)} items={menuEntries} selectedId={preferred?.key} align="end" portal
      onSelect={(id) => { setMenuOpen(false); void launch(entries.find(entry => entry.key === id)) }}
      anchor={<button type="button" style={chevron} aria-label={t('workspace.openWith')} title={t('workspace.openWith')} onClick={() => setMenuOpen(value => !value)}><IconChevronDownOutlineRegular size={10} /></button>} />}
    {failed && <p role="alert" style={failure}>{t('workspace.openFailed')}</p>}
  </div>
}
