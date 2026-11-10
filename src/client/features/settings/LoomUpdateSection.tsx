/** About & updates: the built-in version plus an npm registry check. */
import { useState } from 'react'
import type { LoomKey } from '../../shared/locales.ts'
import { LOOM_VERSION } from '../../shared/version.ts'
import { LoomButton } from '../../ui/Button.tsx'
import { Tag } from '../../ui/primitives.ts'
import { SettingRow } from './LoomSettings.tsx'
import { fetchLatestVersion, type LatestVersionResult } from './update-check.ts'
import classes from './LoomUpdateSection.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the About & updates panel. */
export interface LoomUpdateSectionProps {
  readonly t: Translate
}

/**
 * Render the About & updates rows inside the Settings panel.
 * @param props - locale translator; the version is compiled into the bundle.
 * @returns the settings rows for the version, its check result and upgrade command.
 */
export function LoomUpdateSection({ t }: LoomUpdateSectionProps): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<LatestVersionResult>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)

  async function check(): Promise<void> {
    setChecking(true); setError(undefined); setCopied(false)
    try {
      setResult(await fetchLatestVersion(LOOM_VERSION))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChecking(false)
    }
  }

  async function copy(commandText: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(commandText)
      setCopied(true)
    } catch {
      setError(t('settings.copyFailed'))
    }
  }

  const outdated = result?.outdated === true
  const commandText = outdated ? t('settings.updateCommand').replace('{version}', result.latest) : undefined
  const state = result !== undefined && !outdated
    ? t('settings.latestVersion').replace('{version}', result.latest)
    : undefined
  return <>
    <SettingRow
      divider={false}
      label={t('settings.version')}
      control={<div className={classes.control}>
        <code className={classes.version}>{LOOM_VERSION}</code>
        <LoomButton variant="secondary" size="sm" disabled={checking} onClick={() => { void check() }}>
          {checking ? t('settings.checkingUpdates') : t('settings.checkUpdates')}
        </LoomButton>
      </div>}
    />
    {result !== undefined && <SettingRow
      label={t('settings.updateState')}
      description={outdated ? t('settings.updateAvailable').replace('{latest}', result.latest).replace('{current}', LOOM_VERSION) : state}
      control={outdated ? <Tag tone="info">{t('settings.updateNewest')}</Tag> : <Tag tone="success">{t('settings.updateCurrent')}</Tag>}
    />}
    {error !== undefined && <SettingRow
      label={t('settings.updateState')}
      description={`${t('settings.updateCheckFailed')} · ${error}`}
      control={<Tag tone="warning">{t('settings.updateFailedTag')}</Tag>}
    />}
    {commandText !== undefined && <>
      <SettingRow
        label={t('settings.updateCommandLabel')}
        description={t('settings.updateNoUninstall')}
        control={<LoomButton variant="ghost" size="sm" onClick={() => { void copy(commandText) }}>
          {copied ? t('settings.copied') : t('settings.copyCommand')}
        </LoomButton>}
      />
      <div className={classes.command}><code>{commandText}</code></div>
    </>}
    <p className={classes.footnote}>{t('settings.updateRegistryHint')}</p>
  </>
}
