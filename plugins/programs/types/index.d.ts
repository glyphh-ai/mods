/** Where the mod's page helper listens and its token. Programs has no page
 *  yet: the shared account module reads it, and it stays null. */
export type HelperInfo = { port: number; token: string }

/** A plan's limits for a mod: a number, or null for unlimited. */
export type Limits = Record<string, number | null>

/** The plan's licence, as the server signs it (GET /v1/license's `payload`). */
export type LicencePayload = {
  install_id: string
  user_id: string
  org_id: string
  plan: string
  limits?: Record<string, number | null>
  /** The mods in the plan, each with its limits. */
  mods: Record<string, { limits?: Limits }>
  expires_at: string
}

/** A plan as GET /v1/plans lists it: its name and, per mod it includes, the limits it says. */
export type PlanInfo = { name: string; mods: Record<string, Limits> }

/** The Glyphh account as this session holds it: the sign-in shared by every
 *  Glyphh mod (~/.glyphh/install.json) and the plan's licence
 *  (~/.glyphh/license.json). The token never leaves this module. */
export type AccountState = {
  install: { install_id: string; token: string } | null
  /** A licence that checked out for this install. */
  licence: LicencePayload | null
  /** When the licence was fetched, in ms: it is refreshed at half its life. */
  fetchedAt: number | null
  /** Signing in: the code the person checks, and the page. */
  signIn: { userCode: string; uri: string } | null
  /** Checkout is open: the plan it started from. */
  upgrading: { plan: string } | null
  plans: PlanInfo[]
  /** What the last sign-in, upgrade or billing came to. */
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    programs: {
      account: AccountState
      helper: HelperInfo | null
    }
  }
}
