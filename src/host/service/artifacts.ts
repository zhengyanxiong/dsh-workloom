/** Project-scoped archive for workspace scratch files. */
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Copy a workspace's `.loomtmp` into a project archive destination.
 * @param workspaceRoot - absolute workspace root containing `.loomtmp`.
 * @param destinationRoot - archive directory for one project/workspace.
 * @returns the created archive directory, or undefined when there is nothing to archive.
 */
export async function archiveWorkspaceTemp(workspaceRoot: string, destinationRoot: string): Promise<string | undefined> {
  const source = join(workspaceRoot, '.loomtmp')
  let entries: string[]
  try {
    if (!(await stat(source)).isDirectory()) return undefined
    entries = await readdir(source)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (entries.length === 0) return undefined
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const destination = join(destinationRoot, `${stamp}-${randomUUID().slice(0, 8)}`)
  await mkdir(destinationRoot, { recursive: true })
  await cp(source, destination, { recursive: true, preserveTimestamps: true })
  return destination
}
