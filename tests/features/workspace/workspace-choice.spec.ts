import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { WorkspaceChoice } from '../../../src/client/features/workspace/WorkspaceChoice.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]

it('offers a directory mode when the caller can register existing folders', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceChoice, {
    t,
    ariaLabel: 'Workspace',
    workspaces: [],
    value: undefined,
    onChange: () => {},
    useDirectory: async () => ({ ok: false, error: { message: 'delete.unknownFailure' } }),
  }))
  expect(html).toContain(en['task.workspaceDirectoryPath'])
  expect(html).toContain(en['task.workspaceDirectorySubmit'])
})
