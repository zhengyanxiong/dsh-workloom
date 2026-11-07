/** Wire failure codes and localized failure copy. */
import type { LoomKey } from '../shared/locales.ts'
import { ERROR_LABEL } from './labels.ts'

/**
 * Resolve a remote failure message to its localized explanation.
 * @param failure - Host error code, possibly suffixed with rollback detail.
 * @returns the locale key, or undefined for an unmapped failure.
 */
export function failureKey(failure: string): LoomKey | undefined {
  const code = /^([a-z][a-z0-9_]*)/u.exec(failure)?.[1]
  return code === undefined ? undefined : ERROR_LABEL[code]
}

/** Localized failure line plus optional diagnostic detail. */
export interface FailureReport {
  readonly message: LoomKey
  readonly detail?: string
}

const DELETE_REMOTE = /loom[./]delete(?:Project|Version|Task)/iu
const UNAVAILABLE = /is not a function|is not mounted|no longer mounted|is unavailable|not loaded|definition-unavailable|method-unavailable/iu

function missingDeleteRemote(code: string, message: string): boolean {
  return (code === 'gateway/definition-unavailable' || code === 'gateway/method-unavailable')
    || (DELETE_REMOTE.test(message) && UNAVAILABLE.test(message))
}

/**
 * Resolve one wire failure to localized copy without discarding its diagnostic.
 * Codes win over messages, so an owner-declared `loom/<catalog code>` stays stable
 * when the Host adds context to the message.
 * @param code - stable wire failure code.
 * @param message - Host diagnostic carried beside the code.
 * @returns the localized failure line and, for unknown failures, the diagnostic.
 */
export function failureReport(code: string, message: string): FailureReport {
  const direct = ERROR_LABEL[code]
  const local = code.slice(code.lastIndexOf('/') + 1)
  const key = direct ?? ERROR_LABEL[local] ?? failureKey(message)
  if (key !== undefined) return { message: key }
  if (missingDeleteRemote(code, message)) return { message: 'error.hostNotLoaded' }
  return { message: 'delete.unknownFailure', ...(message === '' ? {} : { detail: `${code}: ${message}` }) }
}

/**
 * Report a thrown call failure, including a local method that the running Host never mounted.
 * @param error - caught value.
 * @returns localized copy and the original message when no specific reason is known.
 */
export function thrownFailureReport(error: unknown): FailureReport {
  const message = error instanceof Error ? error.message : String(error)
  if (missingDeleteRemote('', message)) return { message: 'error.hostNotLoaded' }
  return { message: 'delete.unknownFailure', ...(message === '' ? {} : { detail: message }) }
}

