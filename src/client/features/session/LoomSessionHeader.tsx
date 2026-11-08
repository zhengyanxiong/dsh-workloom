/** Session header: task context pills and the workbench navigation actions. */
import { IconCloseOutlineRegular } from '../../ui/primitives.ts'
import type { TaskPriority } from 'dsh-workloom/types'
import type { TaskStatus } from '../../../domain/task.ts'
import { PRIORITY_META, STATUS_META } from '../../ui/status.ts'
import type { LoomKey } from '../../shared/locales.ts'
import { LoomButton } from '../../ui/Button.tsx'
import classes from './LoomSessionHeader.module.css'

type Translate = (key: LoomKey) => string

/** Inputs for the session header. */
export interface LoomSessionHeaderProps {
  readonly t: Translate
  readonly title: string
  readonly projectName: string | undefined
  readonly versionName: string | undefined
  readonly priority: TaskPriority | undefined
  readonly modules: readonly string[]
  readonly lock: string | undefined
  readonly lockTime?: string | undefined
  readonly taskStatus: TaskStatus | undefined
  readonly onDetails: (() => void) | undefined
  readonly onClose: () => void
}

/**
 * Render the native-session header above the embedded conversation.
 *
 * @param props - session title, task context and navigation actions.
 * @returns the session header.
 */
export function LoomSessionHeader({ t, title, projectName, versionName, priority, modules, lock, lockTime, taskStatus, onDetails, onClose }: LoomSessionHeaderProps): JSX.Element {
  return <div className={classes.header}>
    <span className={classes.title}>{title}</span>
    {projectName !== undefined && <span className={`${classes.pill} ${classes.pillProject}`}>{projectName}</span>}
    {versionName !== undefined && <span className={`${classes.pill} ${classes.pillVersion}`}>{versionName}</span>}
    {priority !== undefined && <span className={classes.pill} style={{ color: PRIORITY_META[priority].color }}>{t(PRIORITY_META[priority].key)}</span>}
    {modules.slice(0, 2).map((module, index) => <span key={`${module}-${String(index)}`} className={classes.pill}>{module}</span>)}
    {lock !== undefined && <span className={`${classes.pill} ${classes.pillLock}`} title={lockTime}>{t('ctx.lockRepos').replace('{count}', '')} {lock}{lockTime !== undefined && <span className={classes.lockTime}> · {lockTime}</span>}</span>}
    {taskStatus !== undefined && <span className={classes.pill}>{t('task.status')}: {t(STATUS_META[taskStatus].key)}</span>}
    <span className={classes.actions}>
      {onDetails !== undefined && <LoomButton size="sm" variant="ghost" onClick={onDetails}>{t('task.details')}</LoomButton>}
      <LoomButton size="sm" variant="ghost" icon={<IconCloseOutlineRegular size={12} />} onClick={onClose}>{t('session.close')}</LoomButton>
    </span>
  </div>
}
