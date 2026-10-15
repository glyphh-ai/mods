/** What a cell shows: a favourite's live page, or one of the desktop app's panes. */
export type Panel = 'browser' | 'files' | 'changes' | 'terminal'

/** A page kept once and shown in any workspace: `~/.glyphh/favorites.json`.
 *  `keep_in_panel` keeps it in its cell: a jump to the native app (Slack,
 *  Teams, Zoom) and a popup load in the same page. */
export type Favorite = { id: string; name: string; url: string; keep_in_panel: boolean }

/** A cell of a workspace's grid, `col_span` × `row_span` slots (1 when
 *  absent); a browser cell shows a favourite, by id. */
export type FileCell = { panel: Panel; col: number; row: number; col_span?: number; row_span?: number; favorite?: string }

/** A workspace's file, `~/.glyphh/workspaces/<slug>.json`. */
export type WorkspaceFile = {
  name: string
  /** The folder the session moves to (absolute); null leaves it where it is. */
  folder: string | null
  /** The model and effort the session takes on a switch (for this session
   *  only, as /model and /effort set them); null leaves them as they are. */
  model: string | null
  effort: string | null
  cols: number
  rows: number
  /** Column widths and row heights, as fractions; dragged in the layout page. */
  col_widths: number[]
  row_heights: number[]
  cells: FileCell[]
}

/** A workspace as read: its file and the slug the file is named by. */
export type Entry = { slug: string; file: WorkspaceFile }

/** What the editor offers for a workspace's model and effort: the /config
 *  menu's model row's values, and /effort's levels. */
export type Choices = { models: string[]; efforts: string[] }

/** The mod's settings (rows of Claude's /config menu), as the page reads them. */
export type PageSettings = { home: 'wall' | 'last workspace'; dock: boolean; dockAutoHide: boolean; iconsPerPage: number }

/** The running layout page helper: where it listens and its token, kept in
 *  the session's memory (never on disk) so a reload of the mod finds it again. */
export type HelperInfo = { port: number; token: string }

/** Where Google Chrome and Node are, as the session start found them. */
export type Requirements = { chrome: string | null; node: string | null }

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
    workspaces: {
      account: AccountState
      entries: Entry[]
      favorites: Favorite[]
      active: string | null
      /** The workspace before the last switch: where `/dip back` goes. */
      previous: string | null
      requirements: Requirements | null
      helper: HelperInfo | null
      choices: Choices
      /** The Browser pane's tab showing the layout page, kept across reloads. */
      layoutTab: string | null
    }
  }
}
