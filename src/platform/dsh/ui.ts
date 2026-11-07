/**
 * The client context shape passed to Workloom's DSH injection callbacks.
 *
 * This alias lets platform adapters be typed without repeating Cordis's
 * overloaded `inject` callback signature.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { LoomKey } from '../../client/shared/locales.ts'

export type LoomUi = Parameters<Parameters<ClientContext['inject']>[1]>[0]

/**
 * Locale translator bound to the Loom namespace.
 */
export type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string
