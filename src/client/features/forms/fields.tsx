import { useEffect, useRef, useState } from 'react'
import { Button, IconChevronDownOutlineRegular, Menu, type MenuEntry } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SourceConfig, RepositoryBranches, RepositoryBranchesRequest } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { field, fieldLabel, hint, input } from './styles.ts'
import { Translate } from './types.ts'

export function PresetOptionLabel({ name, description }: { readonly name: string; readonly description: string }) {
  return <span style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 280 }}>
    <span style={{ fontSize: 'var(--text-h3-size)', lineHeight: '20px', color: COLORS.text }}>{name}</span>
    <span style={{ fontSize: 'var(--text-compact-size)', lineHeight: '16px', color: COLORS.faint, whiteSpace: 'normal' }}>{description}</span>
  </span>
}

/** Free-text ref input backed by the repository's local branch list. */
export function BranchPicker({ t, source, value, listBranches, onChange, compact = false }: {
  t: Translate
  source: SourceConfig
  value: string
  listBranches?: ((request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>) | undefined
  onChange(value: string): void
  /** Hide the per-field label when the enclosing card already identifies the repository. */
  compact?: boolean
}) {
  const [branches, setBranches] = useState<readonly string[]>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string>()
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = inputRef.current
    if (input === null || typeof ResizeObserver === 'undefined') return
    const apply = (): void => {
      const width = input.offsetWidth
      if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(input)
    return () => { observer.disconnect() }
  }, [])
  async function load(openAfter = false): Promise<void> {
    if (listBranches === undefined || loading) return
    setLoading(true); setFailed(false); setFailureMessage(undefined)
    try {
      const result = await listBranches({ repo: source.repo })
      if (result.ok) {
        setBranches(result.value.branches)
        if (openAfter) setOpen(true)
      } else {
        setFailed(true); setFailureMessage(result.error.message)
        if (openAfter) setOpen(true)
      }
    } catch (error) {
      setFailed(true); setFailureMessage(error instanceof Error ? error.message : String(error))
      if (openAfter) setOpen(true)
    } finally { setLoading(false) }
  }
  const query = filterText.trim().toLowerCase()
  const filtered = (branches ?? []).filter(branch => query === '' || branch.toLowerCase().includes(query))
  const typed = value.trim()
  const typedOption = typed !== '' && filtered.length === 0
  const branchItems: MenuEntry[] = [
    ...(typedOption ? [{ id: '__typed__', label: t('branch.useTyped').replace('{value}', typed) }] : []),
    ...filtered.map(branch => ({ id: branch, label: branch })),
  ]
  return <div style={field}>
    {!compact && <span style={fieldLabel}>{t('source.branch')}</span>}
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input ref={inputRef} aria-label={`${t('source.branch')} ${source.path}`}
          placeholder={t('source.branchPlaceholder')} value={value}
          aria-autocomplete="list" aria-expanded={open}
          onChange={event => {
            const next = event.target.value
            onChange(next); setFilterText(next)
            if (branches === undefined && !failed) void load(true)
            else setOpen(true)
          }}
          onFocus={() => { if (branches === undefined) void load() }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); if (branches === undefined) void load(); else setOpen(true); return }
            if (event.key === 'Escape') { if (open) { event.preventDefault(); setOpen(false) } return }
            if (event.key === 'Enter' && open) {
              const exact = filtered.find(branch => branch === typed)
              if (exact !== undefined) { event.preventDefault(); onChange(exact); setFilterText(''); setOpen(false) }
              else if (typed !== '') { event.preventDefault(); setFilterText(''); setOpen(false) }
            }
          }} style={{ ...input, paddingRight: 32 }} />
        {listBranches !== undefined && <span style={{ position: 'absolute', top: 0, right: 2, height: 36, display: 'inline-flex' }}>
          <Menu open={open} onClose={() => setOpen(false)} items={branchItems} selectedId={value === '' ? undefined : value} selection="fill" portal listClassName="loom-branch-menu"
            getAnchorRect={() => inputRef.current?.getBoundingClientRect() ?? null}
            onSelect={branch => { const next = branch === '__typed__' ? typed : branch; if (next !== '') onChange(next); setFilterText(''); setOpen(false) }}
            anchor={<button type="button" aria-label={t('branch.open')} aria-haspopup="listbox" aria-expanded={open}
              onClick={() => {
                if (branches === undefined && !failed) void load()
                const width = inputRef.current?.offsetWidth ?? 0
                if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
                setOpen(current => !current)
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 36, padding: 0, border: 'none', background: 'transparent', color: COLORS.dim, cursor: 'pointer' }}>
              <IconChevronDownOutlineRegular size={16} />
            </button>} />
        </span>}
      </div>
      {listBranches !== undefined && (branches === undefined || failed) && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void load(true) }}>{loading ? t('branch.loading') : t('branch.load')}</Button>}
    </div>
    <p style={hint} title={failureMessage}>
      {failed
        ? /not a git repository|not a git work tree|不是.*git/iu.test(failureMessage ?? '') ? t('branch.notGit') : t('branch.unavailable')
        : branches === undefined
          ? t('branch.chooseOrType')
          : filtered.length === 0
            ? t('branch.noMatch')
            : t('branch.available').replace('{count}', String(branches.length))}
    </p>
  </div>
}

