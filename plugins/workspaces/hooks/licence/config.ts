// What makes the shared account module (shared/licence) this mod's: the only
// file of hooks/licence/ that is the mod's own.
export const MOD = 'workspaces'

/** The mod's name as people read it. */
export const PRODUCT = 'Workspaces'

/** What the mod does, shown while it is closed (signed out, or not in the plan). */
export const ABOUT = [
  'Workspaces sets up the Claude desktop app for a kind of work in one command.',
  '/dip Comms lays Gmail, Slack and Calendar out live, side by side, in one page; /dip IDE opens Files, Changes and Terminal.',
  'Each workspace is a grid of your favourite pages and the app\'s panes, and /dip back returns to the one before.',
]

/** The limits the plan sets for this mod (the licence's mods.workspaces.limits):
 *  a count, or a switch (0 or 1). null in the licence is unlimited; a name
 *  the licence leaves out is 0. */
export const LIMITS = {
  workspaces: { kind: 'count', label: 'workspaces', one: 'workspace' },
  favorites: { kind: 'count', label: 'favourites', one: 'favourite' },
  stream: { kind: 'switch', label: 'The live layout page', one: 'The live layout page' },
} as const satisfies Record<string, { kind: 'count' | 'switch'; label: string; one: string }>

export type LimitName = keyof typeof LIMITS
