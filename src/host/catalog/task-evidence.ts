/**
 * Admission for Agent-reported task evidence.
 *
 * The Host trims and bounds every list before persisting it; an empty report is
 * absent rather than placeholder text.
 */
import type { TaskEvidence } from '../../domain/task.ts'
import { CatalogError } from './errors.ts'

/**
 * Trim and bound one Agent report; empty strings become absent, never placeholder evidence.
 */
export function admitEvidence(input: TaskEvidence): TaskEvidence {
  const summary = input.agentSummary?.trim()
  if (summary !== undefined && summary.length > 4000) throw new CatalogError('invalid_task', 'agentSummary is too long')
  const admitList = (values: readonly string[] | undefined): readonly string[] | undefined => {
    if (values === undefined) return undefined
    const trimmed = values.map(value => value.trim()).filter(value => value !== '')
    if (trimmed.length > 50 || trimmed.some(value => value.length > 500)) throw new CatalogError('invalid_task', 'an evidence list is too long')
    return trimmed.length === 0 ? undefined : trimmed
  }
  const tests = input.testResults?.map(result => {
    const name = result.name.trim()
    if (name === '' || name.length > 500) throw new CatalogError('invalid_task', 'a test result needs a bounded name')
    const command = result.command?.trim()
    const detail = result.detail?.trim()
    if (command !== undefined && command.length > 1000) throw new CatalogError('invalid_task', 'a test command is too long')
    if (detail !== undefined && detail.length > 2000) throw new CatalogError('invalid_task', 'a test detail is too long')
    return {
      name,
      status: result.status,
      ...(command === undefined || command === '' ? {} : { command }),
      ...(detail === undefined || detail === '' ? {} : { detail }),
    }
  })
  if (tests !== undefined && tests.length > 50) throw new CatalogError('invalid_task', 'too many test results')
  const completed = admitList(input.completed)
  const notDone = admitList(input.notDone)
  const risks = admitList(input.risks)
  const impact = admitList(input.impact)
  return {
    ...(summary === undefined || summary === '' ? {} : { agentSummary: summary }),
    ...(completed === undefined ? {} : { completed }),
    ...(notDone === undefined ? {} : { notDone }),
    ...(risks === undefined ? {} : { risks }),
    ...(impact === undefined ? {} : { impact }),
    ...(tests === undefined || tests.length === 0 ? {} : { testResults: tests }),
  }
}
