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
import { COLORS, PRIORITY_META, STATUS_META } from '../shell.ts'
import type { LoomKey } from '../locales.ts'
import { workspaceName, type RecentSession } from '../projection.ts'
import { absoluteTime, relativeTime } from '../time.ts'
import classes from './LoomSidebarParts.module.css'

type Translate = (key: LoomKey) => string

export function TreeRow(props: { depth: number; active?: boolean; expanded?: boolean; icon?: ReactNode; badge?: string; label: ReactNode; color?: string; count?: string; onClick: () => void }) {
  const { depth, active, expanded, icon, badge, label, color, count, onClick } = props
  return <button type="button" data-loom-hover="row" aria-expanded={expanded} onClick={onClick} className={`${classes.treeRow} ${active === true ? classes.treeRowActive : ''}`} style={{ paddingLeft: `${String(12 + depth * 13)}px` }}>
    {expanded !== undefined && <span aria-hidden className={classes.treeChevron}>{expanded ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}</span>}
    {icon !== undefined && <span>{icon}</span>}
    {badge !== undefined && <span className={classes.treeBadge}>{badge}</span>}
    <span className={classes.treeLabel}>{label}</span>
    {count !== undefined && <span className={classes.treeCount}>{count}</span>}
    {color !== undefined && <span aria-hidden className={classes.treeDot} style={{ color }}>●</span>}
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
  return <button type="button" data-loom-hover="row" className={`${classes.sessionRow} ${active ? classes.sessionRowActive : ''}`} onClick={onSelect}>
    <span className={classes.sessionDot} style={{ background: row.running ? 'var(--color-success)' : 'var(--color-line)' }} />
    <span className={classes.sessionBody}>
      <span className={classes.sessionTitle}>{row.title || t('untitledSession')}</span>
      <span className={classes.sessionMeta}>
        {temporary ? <>
          <Tag tone="info">{t('session.temporary')}</Tag>
          {projectName !== undefined && <span className={classes.sessionMetaText}>{projectName}</span>}
        </> : <>
          {projectName !== undefined && <span className={classes.sessionMetaText}>{projectName}</span>}
          {projectName !== undefined && taskTitle !== undefined && <span aria-hidden>·</span>}
          {taskTitle !== undefined
            ? <span className={classes.sessionMetaText}>{taskTitle}</span>
            : projectName === undefined && workspace !== undefined && <span className={classes.sessionMetaText}>{workspace}</span>}
        </>}
        <time className={classes.sessionTime} dateTime={absoluteTime(row.updatedAt)} title={absoluteTime(row.updatedAt)}>{relativeTime(row.updatedAt)}</time>
      </span>
    </span>
  </button>
}

export function PinButton({ pinned, label, onToggle }: { pinned: boolean; label: string; onToggle: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={pinned} title={label} onClick={onToggle} className={`${classes.pinButton} ${pinned ? classes.pinButtonActive : ''}`}>
    {pinned ? <IconPinFillRegular size={14} /> : <IconPinOutlineRegular size={14} />}
  </button>
}

export function TreeIconAction({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" className={`${classes.rowAction} ${danger ? classes.rowActionDanger : ''}`} aria-label={label} title={label} onClick={onClick}>{icon}</button>
}

export function SidebarSectionToggle({ label, count, icon, open, onToggle }: { label: string; count?: string | undefined; icon?: ReactNode | undefined; open: boolean; onToggle: () => void }) {
  return <button type="button" className={classes.sectionHead} aria-expanded={open} onClick={onToggle}>
    <span aria-hidden className={classes.sectionChevron}>{open ? <IconChevronDownOutlineRegular size={11} /> : <IconChevronRightOutlineRegular size={11} />}</span>
    {icon !== undefined && <span aria-hidden style={{ display: 'inline-flex', flex: 'none' }}>{icon}</span>}
    <span className={classes.sectionLabel}>{label}</span>
    {count !== undefined && <span className={classes.sectionCount}>{count}</span>}
  </button>
}

export function ProjectTaskRow({ task, active, t, onClick }: { task: TaskRecord; active: boolean; t: Translate; onClick: () => void }) {
  const status = STATUS_META[task.status]
  const priority = task.priority ?? 'normal'
  const priorityMeta = PRIORITY_META[priority]
  const detail = [task.title, t(status.key), t(priorityMeta.key)].join(' · ')
  return <button type="button" data-loom-hover="row" aria-pressed={active} title={detail} onClick={onClick}
    style={{ display: 'flex', alignItems: 'flex-start', gap: 7, width: '100%', padding: '5px 10px 5px 40px', textAlign: 'left', border: 'none', borderLeft: `2px solid ${active ? COLORS.accent : 'transparent'}`, background: active ? COLORS.selected : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
    <span aria-hidden style={{ flex: 'none', width: 6, height: 6, marginTop: 6, borderRadius: 999, background: status.color }} />
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 500 : 400, color: active ? COLORS.text : COLORS.dim }}>{task.title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 10.5, color: COLORS.faint }}>
        <span>{t(status.key)}</span>
        {priority !== 'normal' && <><span aria-hidden>·</span><span style={{ color: priorityMeta.color }}>{t(priorityMeta.key)}</span></>}
        <time style={{ marginLeft: 'auto', color: COLORS.faint, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-nano-size)' }} dateTime={absoluteTime(task.updatedAt)} title={absoluteTime(task.updatedAt)}>{relativeTime(task.updatedAt)}</time>
      </span>
    </span>
  </button>
}


