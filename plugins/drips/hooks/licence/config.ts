// What makes the shared account module (shared/licence) this mod's: the only
// file of hooks/licence/ that is the mod's own.
export const MOD = 'drips'

/** The mod's name as people read it. */
export const PRODUCT = 'Drips'

/** What the mod does, shown while it is closed (signed out, or not in the plan). */
export const ABOUT = [
  'Drips plays visual effects over Claude: confetti, fireworks, hearts, a matrix rain and more.',
  '/drip confetti plays one; /drip 3 hearts stars plays several in turn; /drip -1 aurora keeps one going until /drip stop.',
  'Save your own recipes in /drips, play them by name, and let Claude play them too.',
]

/** The limits the plan sets for this mod (the licence's mods.drips.limits):
 *  a count, or a switch (0 or 1). null in the licence is unlimited; a name
 *  the licence leaves out is 0. */
export const LIMITS = {
  custom_drips: { kind: 'count', label: 'saved drips', one: 'saved drip' },
  fullscreen: { kind: 'switch', label: 'Fullscreen', one: 'Fullscreen' },
} as const satisfies Record<string, { kind: 'count' | 'switch'; label: string; one: string }>

export type LimitName = keyof typeof LIMITS
