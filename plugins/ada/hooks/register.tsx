// Ada: deploy, call and continue models in rrotor, the sandboxed runtime
// this mod installs and starts. The licence's hooks go first, so they stand
// around the mod's own.
import type { Register } from 'claude-code'

import { licensing } from './licence/hooks.tsx'
import { ada } from './ada/hooks.tsx'

export const register: Register = (on, options) => {
  licensing(on)
  ada(on, options)
}
