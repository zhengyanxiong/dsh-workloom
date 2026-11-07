/** Locale lookup shared by Loom form modules. */
import type { LoomKey } from '../../locales.ts'

export type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string
