// What makes the shared account module (shared/licence) this mod's: the only
// file of hooks/licence/ that is the mod's own.
export const MOD = 'programs'

/** The mod's name as people read it. */
export const PRODUCT = 'Programs'

/** What the mod does, shown while it is closed (signed out, or not in the plan). */
export const ABOUT = [
  'Programs runs jobs you write with Claude in rrotor, a sandboxed runtime on this machine: deploy a folder at a commit, call it, answer what it asks.',
  'Ask Claude to deploy and run a program; /programs shows rrotor and what is waiting for you.',
]

/** The limits the plan sets for this mod (the licence's mods.programs.limits):
 *  each a count. null in the licence is unlimited; a name the licence leaves out is 0. */
export const LIMITS = {
  programs: { kind: 'count', label: 'programs', one: 'program' },
  runs_per_day: { kind: 'count', label: 'runs a day', one: 'run a day' },
} as const satisfies Record<string, { kind: 'count' | 'switch'; label: string; one: string }>

export type LimitName = keyof typeof LIMITS
