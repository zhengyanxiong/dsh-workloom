import { describe, expect, it } from 'vitest'
import { CatalogError } from '../src/host/catalog.ts'
import { WorkspacePreparationError } from '../src/git/workspace.ts'
import { ExecutionError } from '../src/domain/execution.ts'

describe('error descriptions', () => {
  it('keeps the stable catalog code and adds an explanation', () => {
    const error = new CatalogError('missing_project', 'proj-1')
    expect(error.code).toBe('missing_project')
    expect(error.message).toContain('missing_project:')
    expect(error.message).toContain('does not exist')
    expect(error.message).toContain('proj-1')
  })

  it('keeps the stable preparation code and adds an explanation', () => {
    const error = new WorkspacePreparationError('existing_root', [], undefined, '/tmp/ws')
    expect(error.code).toBe('existing_root')
    expect(error.message).toContain('existing_root:')
    expect(error.message).toContain('already exists')
    expect(error.message).toContain('/tmp/ws')
  })

  it('keeps the stable execution code and adds an explanation', () => {
    const error = new ExecutionError('stale_owner')
    expect(error.code).toBe('stale_owner')
    expect(error.message).toContain('stale_owner:')
    expect(error.message).toContain('stale')
  })
})
