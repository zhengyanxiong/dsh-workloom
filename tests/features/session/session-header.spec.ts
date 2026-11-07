/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { en, type LoomKey } from '../../../src/client/locales.ts'
import { LoomSessionHeader } from '../../../src/client/features/session/LoomSessionHeader.tsx'

const t = (key: LoomKey) => en[key]

it('renders task context pills and the session actions', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionHeader, {
    t,
    title: 'Fix checkout',
    projectName: 'Shop',
    versionName: 'v1',
    priority: 'high',
    modules: ['web', 'api', 'ignored'],
    lock: 'abc1234',
    taskStatus: 'running',
    onDetails: () => undefined,
    onClose: () => undefined,
  }))
  expect(html).toContain('Fix checkout')
  expect(html).toContain('Shop')
  expect(html).toContain('v1')
  expect(html).toContain(en['task.priority.high'])
  expect(html).toContain('web')
  expect(html).toContain('api')
  expect(html).not.toContain('ignored')
  expect(html).toContain('abc1234')
  expect(html).toContain(en['task.status'])
  expect(html).toContain(en['task.details'])
  expect(html).toContain(en['session.close'])
})

it('omits details when no task is in context', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionHeader, {
    t,
    title: 'Temp session',
    projectName: undefined,
    versionName: undefined,
    priority: undefined,
    modules: [],
    lock: undefined,
    taskStatus: undefined,
    onDetails: undefined,
    onClose: () => undefined,
  }))
  expect(html).toContain('Temp session')
  expect(html).not.toContain(en['task.details'])
  expect(html).toContain(en['session.close'])
})
