/**
 * Host service configuration and version-context limits.
 */
import Schema from '@deepseek-ai/schemastery'
import { isAbsolute, normalize } from 'node:path'

/**
 * Optional version-context injection limits; every value defaults from the shared module.
 */
export interface ContextConfig {
  readonly enabled?: boolean
  readonly maxTasks?: number
  readonly maxTitleChars?: number
  readonly maxPathChars?: number
  readonly maxDescriptionChars?: number
  readonly maxTokens?: number
}

/**
 * Absolute catalog file, optional workspace parent and optional context limits; the service
 * creates missing directories.
 */
export interface Config { catalogFile: string; workspacesDir?: string; context?: ContextConfig }
const absolute = Schema.transform(Schema.string().required(), value => {
  if (!isAbsolute(value) || normalize(value) !== value) throw new Error('path must be absolute and normalized')
  return value
})
const contextConfigSchema = Schema.object({
  enabled: Schema.boolean(),
  maxTasks: Schema.natural(),
  maxTitleChars: Schema.natural(),
  maxPathChars: Schema.natural(),
  maxDescriptionChars: Schema.natural(),
  maxTokens: Schema.natural(),
})
export const configSchema: Schema<Config> = Schema.object({
  catalogFile: absolute.required(),
  workspacesDir: absolute,
  context: contextConfigSchema,
})
