/** What a cell shows: a favourite's live page, or one of the desktop app's panes. */
export type Panel = 'browser' | 'files' | 'changes' | 'terminal'

/** A page kept once and shown in any workspace: `~/.glyphh/favorites.json`. */
export type Favorite = { id: string; name: string; url: string }

/** A cell of a workspace's grid; a browser cell shows a favourite, by id. */
export type FileCell = { panel: Panel; col: number; row: number; row_span?: number; favorite?: string }

/** A workspace's file, `~/.glyphh/workspaces/<slug>.json`. */
export type WorkspaceFile = {
  name: string
  /** The folder the session moves to (absolute); null leaves it where it is. */
  folder: string | null
  cols: number
  rows: number
  /** Column widths and row heights, as fractions; dragged in the layout page. */
  col_widths: number[]
  row_heights: number[]
  cells: FileCell[]
}

/** A workspace as read: its file and the slug the file is named by. */
export type Entry = { slug: string; file: WorkspaceFile }

/** The pane's last word: what an action did, or why not. */
export type Note = { text: string; isError: boolean }

/** A workspace being made or changed in the pane, saved only by Save. */
export type Draft = {
  /** The workspace's name when it was opened; null for a new one. */
  original: string | null
  name: string
  folder: string
  cols: number
  rows: number
  /** Sizes as typed, in percent ("55 45"); blank is an even split. */
  widths: string
  heights: string
  cells: FileCell[]
  error: string | null
  isConfirmingDelete: boolean
}

/** A favourite being added or changed in the pane. */
export type FavoriteDraft = {
  /** The favourite's id; null for a new one. */
  id: string | null
  name: string
  url: string
  error: string | null
  isConfirmingDelete: boolean
}

/** Which page the pane shows. */
export type View =
  | { page: 'list' }
  | { page: 'edit'; draft: Draft }
  | { page: 'favorites' }
  | { page: 'favorite'; draft: FavoriteDraft }

/** Where Google Chrome and Node are, as the session start found them. */
export type Requirements = { chrome: string | null; node: string | null }

/** The licence as this install holds it. */
export type LicenceState = {
  /** A licence that checked out, kept in the store. */
  licence: string | null
  /** When this install first ran, in ms: the trial counts from it. */
  trialStartedAt: number | null
  /** Checkout is open and the site is being asked whether it went through. */
  isWaiting: boolean
  /** What the last unlock attempt came to. */
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    workspaces: {
      licence: LicenceState
      entries: Entry[]
      favorites: Favorite[]
      active: string | null
      /** The workspace before the last switch: where `/dip back` goes. */
      previous: string | null
      note: Note | null
      view: View
      requirements: Requirements | null
      /** The Browser pane's tab showing the layout page, kept across reloads. */
      layoutTab: string | null
    }
  }
}
