// Drips: visual effects over Claude's window, the whole screen or its Browser pane.
// The licence's hooks go first, so they stand around the mod's own.
import type { Register } from 'claude-code'

import { drips } from './drips/hooks.tsx'
import { licensing } from './licence/hooks.tsx'

export const register: Register = (on, options) => {
  licensing(on)
  drips(on, options)
}
