/**
 * Sidebar building blocks shared by the project tree and session list.
 *
 * These components are presentation-only and keep their action callbacks in
 * the shell; the sidebar container owns layout and expansion state.
 */
import type { CSSProperties, ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconPinFillRegular,
  IconPinOutlineRegular, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskRecord } from 'dsh-workloom/types'
import { COLORS, metaLine, PRIORITY_META, STATUS_META } from '../shell.ts'
import type { LoomKey } from '../locales.ts'
import { workspaceName, type RecentSession } from '../projection.ts'

type Translate = (key: LoomKey) => string

export function TreeRow(props: { depth: number; active?: boolean; expanded?: boolean; icon?: ReactNode; badge?: string; label: ReactNode; color?: string; count?: string; onClick: () => void }) {
  const { depth, active, expanded, icon, badge, label, color, count, onClick } = props
  return <button type="button" aria-expanded={expanded} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', background: active === true ? COLORS.panel3 : 'transparent', border: 'none', borderLeft: `2px solid ${active === true ? COLORS.accent : 'transparent'}`, padding: `5px 12px 5px ${String(14 + depth * 13)}px`, color: active === true ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: depth === 2 ? 12 : 13 }}>
    {expanded !== undefined && <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, flex: 'none', color: COLORS.dim, opacity: .9 }}>{expanded ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}</span>}
    {icon !== undefined && <span>{icon}</span>}
    {badge !== undefined && <span style={{ fontSize: 10, color: COLORS.cyan, background: 'rgba(57,197,207,.12)', padding: '0 5px', borderRadius: 4 }}>{badge}</span>}
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {count !== undefined && <span style={{ marginLeft: 'auto', ...metaLine }}>{count}</span>}
    {color !== undefined && <span style={{ marginLeft: count === undefined ? 'auto' : 0, color, fontSize: 10 }}>●</span>}
  </button>
}

export const versionChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--loom-accent) 11%, transparent)', color: COLORS.accent, fontSize: 10.5, fontWeight: 500 }

export function SidebarSessionRow({ t, row, projectName, taskTitle, temporary, active, onSelect }: {
  t: Translate
  row: RecentSession
  projectName?: string | undefined
  taskTitle?: string | undefined
  temporary: boolean
  active: boolean
  onSelect: () => void
}) {
  const workspace = workspaceName(row.cwd)
  const detail = [projectName, taskTitle, workspace, row.title].filter((value): value is string => value !== undefined && value !== '').join(' · ')
  return <button type="button" aria-pressed={active} title={detail} onClick={onSelect}
    style={{ display: 'flex', alignItems: 'flex-start', gap: 7, width: '100%', padding: '6px 10px', textAlign: 'left', border: 'none', borderRadius: 'var(--dsw-radius-sm)', background: active ? COLORS.panel3 : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
    <span aria-hidden style={{ flex: 'none', width: 6, height: 6, marginTop: 6, borderRadius: 999, background: row.running ? COLORS.green : COLORS.border }} />
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 500 : 400, color: active ? COLORS.text : COLORS.dim }}>{row.title || t('untitledSession')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 10.5, color: COLORS.faint }}>
        {temporary
          ? <>
              <Tag tone="info">{t('session.temporary')}</Tag>
              {projectName !== undefined && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</span>}
            </>
          : <>
              {projectName !== undefined && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim }}>{projectName}</span>}
              {projectName !== undefined && taskTitle !== undefined && <span aria-hidden style={{ flex: 'none', color: COLORS.faint }}>·</span>}
              {taskTitle !== undefined
                ? <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskTitle}</span>
                : projectName === undefined && workspace !== undefined && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace}</span>}
            </>}
      </span>
    </span>
  </button>
}

export function PinButton({ pinned, label, onToggle }: { pinned: boolean; label: string; onToggle: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={pinned} title={label} onClick={onToggle}
    style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: pinned ? COLORS.green : COLORS.faint, cursor: 'pointer', opacity: pinned ? 1 : 0.6 }}>
    {pinned ? <IconPinFillRegular size={14} /> : <IconPinOutlineRegular size={14} />}
  </button>
}

export function TreeIconAction({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" className="loom-row-action" aria-label={label} title={label} onClick={onClick}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, padding: 0, border: 'none', borderRadius: 4, background: 'transparent', color: danger ? COLORS.error : COLORS.dim, cursor: 'pointer' }}>
    {icon}
  </button>
}

export function SidebarSectionToggle({ label, count, icon, open, onToggle }: { label: string; count?: string | undefined; icon?: ReactNode | undefined; open: boolean; onToggle: () => void }) {
  return <button type="button" className="loom-sidebar-section-head" aria-expanded={open} onClick={onToggle}
    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px 4px', border: 'none', background: 'transparent', color: COLORS.faint, cursor: 'pointer', font: 'inherit', ...metaLine, fontWeight: 500 }}>
    <span aria-hidden style={{ display: 'inline-flex', flex: 'none', opacity: .85 }}>{open ? <IconChevronDownOutlineRegular size={11} /> : <IconChevronRightOutlineRegular size={11} />}</span>
    {icon !== undefined && <span aria-hidden style={{ display: 'inline-flex', flex: 'none' }}>{icon}</span>}
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {count !== undefined && <span style={{ marginLeft: 'auto', fontWeight: 400, flex: 'none' }}>{count}</span>}
  </button>
}

export function ProjectTaskRow({ task, active, t, onClick }: { task: TaskRecord; active: boolean; t: Translate; onClick: () => void }) {
  const status = STATUS_META[task.status]
  const priority = task.priority ?? 'normal'
  const priorityMeta = PRIORITY_META[priority]
  const detail = [task.title, t(status.key), t(priorityMeta.key)].join(' · ')
  return <button type="button" aria-pressed={active} title={detail} onClick={onClick}
    style={{ display: 'flex', alignItems: 'flex-start', gap: 7, width: '100%', padding: '5px 10px 5px 40px', textAlign: 'left', border: 'none', borderLeft: `2px solid ${active ? COLORS.accent : 'transparent'}`, background: active ? COLORS.selected : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
    <span aria-hidden style={{ flex: 'none', width: 6, height: 6, marginTop: 6, borderRadius: 999, background: status.color }} />
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 500 : 400, color: active ? COLORS.text : COLORS.dim }}>{task.title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 10.5, color: COLORS.faint }}>
        <span>{t(status.key)}</span>
        {priority !== 'normal' && <><span aria-hidden>·</span><span style={{ color: priorityMeta.color }}>{t(priorityMeta.key)}</span></>}
      </span>
    </span>
  </button>
}


