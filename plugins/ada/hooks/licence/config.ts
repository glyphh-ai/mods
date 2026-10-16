// What makes the shared account module (shared/licence) this mod's: the only
// file of hooks/licence/ that is the mod's own.
export const MOD = 'ada'

/** The mod's name as people read it. */
export const PRODUCT = 'Ada'

/** What the mod does, shown while it is closed (signed out, or not in the plan). */
export const ABOUT = [
  'Ada runs your models in rrotor, a sandboxed runtime on this machine: a spec and a small model file, deployed by commit, learning from the precedents they record.',
  'Ask Claude to deploy and call a model; /ada shows rrotor and what is waiting for you.',
]

/** The limits the plan sets for this mod (the licence's mods.ada.limits):
 *  each a count. null in the licence is unlimited; a name the licence leaves out is 0. */
export const LIMITS = {
  models: { kind: 'count', label: 'models', one: 'model' },
  precedents: { kind: 'count', label: 'precedents', one: 'precedent' },
} as const satisfies Record<string, { kind: 'count' | 'switch'; label: string; one: string }>

export type LimitName = keyof typeof LIMITS
