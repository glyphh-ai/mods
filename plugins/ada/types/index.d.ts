/** Where the mod's page helper listens and its token. Ada has no page
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

/** A plan as GET /v1/plans lists it: its name, per mod it includes the
 *  limits it says, and its price a seat a month in cents when it says it. */
export type PlanInfo = { name: string; mods: Record<string, Limits>; price?: number }

/** An add-on as GET /v1/addons lists it for the org's plan: a mod sold as a
 *  line on the org's subscription (every mod but Workspaces). */
export type AddonInfo = {
  mod: string
  name: string
  /** A month, in cents: per seat when per_seat, else flat. */
  price_cents: number
  per_seat: boolean
  /** The paid plans it may be added to. */
  plans: string[]
  /** Whether a Free org may have it. */
  free: boolean
  /** Whether the org's plan may have it. */
  allowed: boolean
  /** Whether the org has it. */
  added: boolean
}

/** What adding the add-on costs, as POST /v1/billing/addons/preview said:
 *  shown with Confirm, and its proration date sent back when adding. */
export type AddonQuote = { mod: string; proratedCents: number; monthlyCents: number; currency: string; prorationDate: number }

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
  /** Checkout is open: the plan it started from, and the add-on it buys. */
  upgrading: { plan: string; mod?: string } | null
  plans: PlanInfo[]
  /** The add-on catalog for the org's plan, and which it has. */
  addons: AddonInfo[]
  /** An add-on's price, previewed, awaiting Confirm. */
  quote: AddonQuote | null
  /** What the last sign-in, upgrade, add-on or billing came to. */
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    ada: {
      account: AccountState
      helper: HelperInfo | null
    }
  }
}
