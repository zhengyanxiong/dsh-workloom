/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ProjectForm } from '../../../src/client/features/project/ProjectForm.tsx'
import { projectRequest, sourcePathsOverlap } from '../../../src/client/features/forms/drafts.ts'
import { TaskForm } from '../../../src/client/features/task/TaskForm.tsx'
import { BranchPicker } from '../../../src/client/features/forms/fields.tsx'
import { VersionForm } from '../../../src/client/features/version/VersionForm.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'
import type { ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('rejects multiple repositories that claim the workspace root', () => {
  const rooted = [{ repo: '/repo/a', path: '.' }, { repo: '/repo/b', path: 'b' }]
  expect(sourcePathsOverlap(rooted)).toBe(true)
  expect(projectRequest('Shop', rooted, [])).toBeUndefined()
  expect(projectRequest('Shop', [{ repo: '/repo/a', path: 'a' }, { repo: '/repo/b', path: 'b' }], [])).toBeDefined()
})

it('advances from the name step with only a name before repositories are filled', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, create: async () => ({ ok: false, error: { code: 'invalid_form', message: 'unused' } }), onCreated: () => undefined,
    }))
  })
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Project name"]')
  expect(input).not.toBeNull()
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, '安抚')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const next = [...container.querySelectorAll('button')].find(button => button.textContent === en['form.next'])
  expect(next).toBeDefined()
  await act(async () => { next?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container.textContent).toContain(en['source.hint'])
  expect(container.textContent).not.toContain('invalid_form')
  expect(container.querySelector('input[aria-label="Project name"]')).toBeNull()
})

it('edits a project on one page and saves without a wizard', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  let updates = 0
  let savedName = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, project,
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async request => { updates += 1; savedName = request.config.name; return { ok: true, value: project } },
      onCreated: () => undefined,
    }))
  })
  const find = (label: string) => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
  expect(find(en['form.next'])).toBeUndefined()
  expect(container?.textContent).toContain(en['source.hint'])
  expect(container?.textContent).toContain(en['module.optional'])
  expect(updates).toBe(0)
  const save = find(en['form.save'])
  expect(save).toBeDefined()
  await act(async () => { save?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(updates).toBe(1)
  expect(savedName).toBe('Shop')
})

it('picks a localized Agent preset with its description and saves the id', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  let savedPreset = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, project,
      agentPresets: [
        { id: 'standard', isDefault: true, name: en['preset.standardName'], description: en['preset.standardDescription'] },
        { id: 'ptc', isDefault: false, name: en['preset.ptcName'], description: en['preset.ptcDescription'] },
      ],
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async request => { savedPreset = request.config.agentPreset ?? ''; return { ok: true, value: project } },
      onCreated: () => undefined,
    }))
  })
  const click = async (target: Element | null | undefined) => {
    expect(target).toBeDefined()
    expect(target).not.toBeNull()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const trigger = container.querySelector('button[aria-label="Agent preset"]')
  expect(trigger?.textContent).toContain(en['project.agentPresetDefault'])
  await click(trigger)
  expect(document.body.textContent).toContain(en['preset.ptcDescription'])
  const option = [...document.querySelectorAll('button')].find(button => button.textContent?.includes(en['preset.ptcName']))
  await click(option)
  expect(trigger?.textContent).toContain(en['preset.ptcName'])
  const next = () => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === en['form.next'])
  const save = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === en['form.save'])
  await click(save)
  expect(savedPreset).toBe('ptc')
})

it('walks a new version from name through refs to preview before creating', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  let created: unknown
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project,
      create: async request => { created = request; return { ok: true, value: version } },
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string) => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    expect(target).toBeDefined()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  expect(container.textContent).toContain(en['version.step.refs'])
  await click(en['form.next'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  expect(container.textContent).toContain(en['version.allRequired'])
  expect(container.textContent).toContain(en['version.lockHelperTitle'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.workspaceAuto'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.workspaceParentPath']}"]`), '/tmp/loom-ws')
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.workspaceName']}"]`), 'v2-auto')
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.previewHint'])
  expect(created).toBeUndefined()
  await click(en['form.create'])
  expect(created).toMatchObject({ name: 'v2', sources: [{ sourceId: 'web', ref: 'main' }], workspaces: [{ mode: 'auto', parentPath: '/tmp/loom-ws', name: 'v2-auto' }] })
})

it('walks a new task from content through optional scope to preview before creating', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [], agentPreset: 'ptc' },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), projectId: project.id, versionId: version.id, title: 'Ship', status: 'pending' }
  let created: unknown
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TaskForm, {
      t, open: true, project, version,
      agentPresets: [{ id: 'ptc', isDefault: false, name: 'PTC' }, { id: 'minimal', isDefault: false, name: 'Minimal' }],
      create: async request => { created = request; return { ok: true, value: task } },
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | null, value: string) => {
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string) => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    expect(target).toBeDefined()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['task.name']}"]`), 'Ship')
  expect(container.textContent).toContain(en['task.step.scope'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['task.priority'])
  expect(container.textContent).toContain(en['task.agentPreset'])
  expect(container.textContent).toContain('PTC')
  expect(container.textContent).toContain(en['form.skip'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['task.step.preview'])
  await click(en['form.create'])
  expect(created).toMatchObject({ title: 'Ship', versionId: 'v1' })
})

it('filters the local branch list from the typed ref and still accepts free text', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  class StubResizeObserver { observe(): void {} disconnect(): void {} }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: StubResizeObserver })
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'web' }], modules: [] },
  }
  const version: VersionRecord = {
    id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1',
    sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }],
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project, version,
      listBranches: async () => ({ ok: true, value: { topLevel: '/repo/shop', current: 'main', branches: ['main', 'release/1.0'] } }),
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async () => ({ ok: true, value: version }),
      onCreated: () => undefined,
    }))
  })
  const input = container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`)
  expect(input).not.toBeNull()
  await act(async () => { input?.focus(); await Promise.resolve() })
  const arrow = container.querySelector<HTMLButtonElement>(`button[aria-label="${en['branch.open']}"]`)
  expect(arrow).not.toBeNull()
  await act(async () => { arrow?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  const labels = (): string[] => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(item => item.textContent ?? '')
  expect(labels()).toEqual(['main', 'release/1.0'])
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, 'rel')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(labels()).toEqual(['release/1.0'])
  await act(async () => {
    const release = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === 'release/1.0')
    release?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(input?.value).toBe('release/1.0')
  await act(async () => {
    setter?.call(input, 'hotfix/1.0')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const typedLabel = en['branch.useTyped'].replace('{value}', 'hotfix/1.0')
  expect(labels()).toEqual([typedLabel])
  await act(async () => {
    const typed = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === typedLabel)
    typed?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(input?.value).toBe('hotfix/1.0')
})


it('keeps only one branch dropdown open across sibling pickers', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const sources = [
    { id: brandString<'loom.source'>('a'), repo: '/repo/a', path: 'a' },
    { id: brandString<'loom.source'>('b'), repo: '/repo/b', path: 'b' },
  ]
  const listBranches = async (): Promise<{ ok: true; value: { topLevel: string; current: string; branches: string[] } }> => ({ ok: true, value: { topLevel: '/repo', current: 'main', branches: ['main', 'dev'] } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement('div', null, sources.map(source => createElement(BranchPicker, { key: source.id, t, source, value: '', listBranches, onChange: () => undefined }))))
  })
  const arrows = [...container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${en['branch.open']}"]`)]
  expect(arrows).toHaveLength(2)
  await act(async () => { arrows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)) })
  await act(async () => { arrows[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)) })
  // The first menu closes when the second opens, so only one menu's items exist.
  expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
})

it('offers reuse of a finished direct workspace while editing a version', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v2', sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }] }
  let reused = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project, version,
      addWorkspace: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      reuseWorkspace: async (workspaceId: string) => { reused = workspaceId; return { ok: false, error: { code: 'unused', message: 'unused' } } },
      reuseCandidates: [{ id: 'ws-1', label: 'v1 · v1-auto', detail: '/work/v1-auto' }],
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      onCreated: () => undefined,
    }))
  })
  const add = [...container.querySelectorAll('button')].find(button => button.textContent === en['version.workspaceAdd'])
  await act(async () => { add?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  const reuseMode = [...container.querySelectorAll('button')].find(button => button.textContent === en['version.workspaceReuse'])
  expect(reuseMode).toBeDefined()
  await act(async () => { reuseMode?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container.querySelector(`[aria-label^="${en['version.workspaceReusePick']}"]`)).not.toBeNull()
  expect(container.textContent).toContain(en['version.workspaceReuseNote'])
  const action = [...container.querySelectorAll('button')].find(button => button.textContent === en['version.workspaceReuseAction'])
  expect(action?.hasAttribute('disabled')).toBe(true)
  expect(reused).toBe('')
})

it('binds a ready version workspace as the task default and picks it up when it arrives late', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  const workspace = { id: 'ws-1', label: 'v1-auto', rootPath: '/work/v1-auto', path: '/work/v1-auto' }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const render = async (workspaces: readonly typeof workspace[]): Promise<void> => {
    await act(async () => {
      root?.render(createElement(TaskForm, {
        t, open: true, project, version, workspaces,
        createWorkspace: async () => ({ ok: false, error: { message: 'delete.unknownFailure', detail: 'unused' } }),
        useWorkspaceDirectory: async () => ({ ok: false, error: { message: 'delete.unknownFailure', detail: 'unused' } }),
        create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
        onCreated: () => undefined,
      }))
    })
  }
  await render([])
  const setValue = async (input: HTMLInputElement | null, value: string): Promise<void> => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string): Promise<void> => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['task.name']}"]`), 'Ship')
  await click(en['form.next'])
  expect(container.textContent).toContain(en['task.workspaceRequired'])
  await render([workspace])
  expect(container.textContent).toContain(en['task.workspaceChoiceExisting'])
  expect(container.textContent).toContain('/work/v1-auto')
  expect(container.textContent).not.toContain(en['task.workspaceRequired'])
})

it('keeps the version wizard on the workspace step until a workspace draft exists', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, { t, open: true, project, create: async () => ({ ok: true, value: version }), onCreated: () => undefined }))
  })
  const setValue = async (input: HTMLInputElement | null, value: string): Promise<void> => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string): Promise<void> => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  await click(en['form.next'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.workspaceAuto'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.workspaceAuto'])
  expect(container.textContent).not.toContain(en['version.previewHint'])
})

it('explains a version whose workspaces are bound but not ready and offers a refresh', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v2', sources: [] }
  let refreshed = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TaskForm, {
      t, open: true, project, version, workspaces: [],
      versionWorkspaces: [{ id: 'ws-1', label: 'v1-auto', status: 'workspace.statePending' }],
      onRefresh: () => { refreshed += 1 },
      createWorkspace: async () => ({ ok: false, error: { message: 'delete.unknownFailure' } }),
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      onCreated: () => undefined,
    }))
  })
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  const name = container.querySelector<HTMLInputElement>(`input[aria-label="${en['task.name']}"]`)
  await act(async () => {
    setter?.call(name, 'Ship')
    name?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const next = [...(container.querySelectorAll('button') ?? [])].find(button => button.textContent === en['form.next'])
  await act(async () => { next?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container.textContent).toContain(en['task.workspaceNotReady'])
  const refresh = [...(container.querySelectorAll('button') ?? [])].find(button => button.textContent === en['task.workspaceRefresh'])
  await act(async () => { refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(refreshed).toBe(1)
})

it('creates a version by reusing an existing project workspace from the wizard', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v2'), projectId: project.id, name: 'v2', sources: [] }
  let captured: { request: unknown; workspaceId: string } | undefined
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project,
      reuseCandidates: [{ id: 'ws-1', label: 'v1 · v1-auto', detail: '/work/v1-auto' }],
      createReusingWorkspace: async (request, workspaceId) => { captured = { request, workspaceId }; return { ok: true, value: version } },
      create: async () => ({ ok: true, value: version }),
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | null, value: string): Promise<void> => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (target: Element | null | undefined): Promise<void> => {
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const button = (label: string): Element | undefined => [...(container?.querySelectorAll('button') ?? [])].find(candidate => candidate.textContent === label)
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  await click(button(en['form.next']))
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  await click(button(en['form.next']))
  await click(button(en['version.workspaceReuse']))
  const trigger = container.querySelector('button[aria-label^="' + en['version.workspaceReusePick'] + '"]')
  expect(trigger).not.toBeNull()
  await click(trigger)
  const option = [...document.querySelectorAll('button')].find(candidate => candidate.textContent?.includes('v1 · v1-auto'))
  await click(option)
  await click(button(en['form.next']))
  expect(container.textContent).toContain(en['version.workspaceReusePreview'])
  await click(button(en['form.create']))
  expect(captured?.workspaceId).toBe('ws-1')
  expect((captured?.request as { workspaces?: unknown }).workspaces).toBeUndefined()
})


it('explains an empty or incompatible reuse candidate list while creating a version', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v2'), projectId: project.id, name: 'v2', sources: [] }
  const render = async (candidates: readonly { id: string; label: string; detail: string; sourceIds?: readonly string[] }[]): Promise<void> => {
    await act(async () => {
      root?.render(createElement(VersionForm, {
        t, open: true, project,
        reuseCandidates: candidates,
        createReusingWorkspace: async () => ({ ok: true, value: version }),
        create: async () => ({ ok: true, value: version }),
        onCreated: () => undefined,
      }))
    })
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const setValue = async (input: HTMLInputElement | null, value: string): Promise<void> => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string): Promise<void> => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await render([])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  await click(en['form.next'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.workspaceReuseEmpty'])
  const reuseButton = (): Element | undefined => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === en['version.workspaceReuse'])
  expect(reuseButton()?.hasAttribute('disabled')).toBe(true)
  await render([{ id: 'ws-1', label: 'v1 · old', detail: '/work/old', sourceIds: ['other'] }])
  expect(container.textContent).toContain(en['version.workspaceReuseIncomplete'])
  expect(reuseButton()?.hasAttribute('disabled')).toBe(true)
  await render([{ id: 'ws-1', label: 'v1 · old', detail: '/work/old', sourceIds: ['web'] }])
  expect(reuseButton()?.hasAttribute('disabled')).toBe(false)
})

it('lists why an existing workspace cannot be reused yet', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v2'), projectId: project.id, name: 'v2', sources: [] }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project,
      reuseCandidates: [],
      reuseUnavailable: [{ label: 'v1 · /work/old', reason: 'workspace.ownerRunning' }],
      createReusingWorkspace: async () => ({ ok: true, value: version }),
      create: async () => ({ ok: true, value: version }),
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | null, value: string): Promise<void> => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string): Promise<void> => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  await click(en['form.next'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.workspaceReuseUnavailable'])
})
