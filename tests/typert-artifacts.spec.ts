import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const artifact = (name: string): string => readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')

const block = (source: string, name: string): string => {
  const start = source.indexOf(`const dsh_workloom_loom_${name} = `)
  expect(start).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('}))', start))
}

it('keeps per-task Agent preset fields in the generated Typert schemas', () => {
  for (const name of ['typert.host.js', 'typert.remote-client.js']) {
    const source = artifact(name)
    for (const schema of [
      'createTask_parameter_0$schema',
      'createTask_parameter_0_strict$schema',
      'updateTask_parameter_0$schema',
      'updateTask_parameter_0_strict$schema',
    ]) {
      expect(block(source, schema), `${name}: ${schema}`).toContain("'agentPreset'")
    }
    // TaskRecord members are emitted in many result and snapshot schemas; each
    // must keep the field or the RPC boundary silently strips it.
    const taskRecord = source.slice(source.indexOf("describe('Version-bound workspace selected when the task was created.'),"))
    expect(taskRecord.slice(0, 260), name).toContain("'agentPreset'")
    expect(source).toContain('"agentPreset":{"type":"string"')
  }
})
