import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Lock, WorkspaceRecord } from 'dsh-workloom/types'
import { LoomWorkspaceList } from '../../../src/client/features/workspace/LoomWorkspaceList.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const versionId = brandString<'loom.version'>('v1')
const lock: Lock = {
  id: brandString<Lock['id']>('lock1'),
  versionId,
  repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'b'.repeat(40) }],
}
const workspace: WorkspaceRecord = {
  id: brandString<WorkspaceRecord['id']>('w1'),
  versionId,
  lockId: lock.id,
  path: '/tmp/workspace',
  rootPath: '/tmp/workspace',
  branches: { [String(lock.repositories[0]!.sourceId)]: 'main' },
  heads: { [String(lock.repositories[0]!.sourceId)]: 'a'.repeat(40) },
}

it('shows the actual checked-out HEAD and marks a divergence from the Lock', () => {
  const html = renderToStaticMarkup(createElement(LoomWorkspaceList, {
    t,
    rows: [{ workspace, lock, tasks: [], waiting: 0, takeover: false }],
  }))
  expect(html).toContain(en['workspace.actualHead'])
  expect(html).toContain('a'.repeat(40).slice(0, 7))
  expect(html).toContain(en['workspace.actualHeadMismatch'])
})
