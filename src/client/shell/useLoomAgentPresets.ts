/** Load Agent presets and localize their catalog copy. */
import { useEffect, useRef, useState } from 'react'
import type { BuiltInPresetCopyKey } from '@deepseek-ai/dsh-agent-preset-registry/display'
import { presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
import type { AgentPresetOption } from '../../api/agent.ts'
import type { LoomKey } from '../locales.ts'
import type { LoomPanelProps } from '../LoomPanel.tsx'

const PRESET_COPY: Readonly<Record<BuiltInPresetCopyKey, LoomKey>> = {
  presetStandardName: 'preset.standardName', presetStandardDescription: 'preset.standardDescription',
  presetPtcName: 'preset.ptcName', presetPtcDescription: 'preset.ptcDescription',
  presetMinimalName: 'preset.minimalName', presetMinimalDescription: 'preset.minimalDescription',
  presetCordisName: 'preset.cordisName', presetCordisDescription: 'preset.cordisDescription',
}

/**
 * Load the Agent preset options once per Loom mount.
 * @param t - locale lookup.
 * @param listAgentPresets - host catalog reader.
 * @returns localized preset options for the project form.
 */
export function useLoomAgentPresets(t: LoomPanelProps['t'], listAgentPresets: LoomPanelProps['listAgentPresets']): readonly AgentPresetOption[] {
  const [agentPresets, setAgentPresets] = useState<readonly AgentPresetOption[]>([])
  const presetsLoaded = useRef(false)
  useEffect(() => {
    if (presetsLoaded.current) return
    presetsLoaded.current = true
    let active = true
    listAgentPresets().then((result) => {
      if (!active || !result.ok) return
      setAgentPresets(result.value.presets.map((preset) => {
        const copy = presetDisplayText(preset, key => t(PRESET_COPY[key]))
        return { ...preset, name: copy.name, ...(copy.description === undefined ? {} : { description: copy.description }) }
      }))
    }, () => { /* the project picker keeps the deployment default */ })
    return () => { active = false }
  }, [listAgentPresets, t])
  return agentPresets
}
