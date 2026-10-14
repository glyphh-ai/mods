/** A pane of the Claude desktop app a workspace opens. `editor` is the Files
 *  pane opened at the file `/editor` last showed. */
export type Pane = 'files' | 'editor' | 'changes' | 'terminal' | 'browser'

/** A page the workspace opens as a tab of the desktop app's Browser pane. */
export type Tab = { url: string; name: string }

/** A workspace's file, `~/.glyphh/workspaces/<slug>.json`. */
export type WorkspaceFile = {
  name: string
  /** The folder the session moves to (absolute); null leaves it where it is. */
  folder: string | null
  model: string | null
  permission_mode: string | null
  effort: string | null
  /** The app's panes this workspace opens, in order; the rest close. */
  desktop_panes: Pane[]
  collapse_sidebar: boolean
  tabs: Tab[]
}

/** A workspace as read: its file and the slug the file is named by. */
export type Entry = { slug: string; file: WorkspaceFile }

/** The workspaces pane's last word: what an action did, or why not. */
export type Note = { text: string; isError: boolean }

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
      active: string | null
      /** The workspace before the last switch: where `/dip back` goes. */
      previous: string | null
      /** The workspace the pane edits. */
      selected: string | null
      note: Note | null
      /** The file `/editor` last opened, absolute. */
      openFile: string | null
      /** The Browser pane's tab id per workspace tab, kept across reloads. */
      paneTabs: Record<string, string>
    }
  }
}
