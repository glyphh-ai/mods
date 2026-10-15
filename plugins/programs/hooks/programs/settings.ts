// The mod's /config rows, made whole: a value outside its options takes the default.
import type { PluginOptions } from 'claude-code'

import type { Settings } from './core.ts'

const RUNTIMES = ['auto', 'container', 'orbstack', 'docker'] as const

export function settingsOf(options: PluginOptions | undefined): Settings {
  const o = (options ?? {}) as Record<string, unknown>
  const runtime = RUNTIMES.find(r => r === o.runtime) ?? 'auto'
  const image = typeof o.image === 'string' ? o.image.trim() : ''
  return { runtime, image }
}
