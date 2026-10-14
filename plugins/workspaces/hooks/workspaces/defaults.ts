// What a first run writes to ~/.glyphh: favourites anyone uses, and
// workspaces made of them. None names a folder (the session stays where it is).
import type { Favorite, WorkspaceFile } from '../../types'
import { defaultGrid } from './model.ts'

export const DEFAULT_FAVORITES: Favorite[] = [
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.google.com' },
  { id: 'google', name: 'Google', url: 'https://www.google.com' },
]

const workspace = (name: string, items: Parameters<typeof defaultGrid>[0]): WorkspaceFile => ({ name, folder: null, ...defaultGrid(items) })

export const DEFAULT_WORKSPACES: WorkspaceFile[] = [
  workspace('Comms', [
    { panel: 'browser', favorite: 'gmail' },
    { panel: 'browser', favorite: 'slack' },
    { panel: 'browser', favorite: 'calendar' },
  ]),
  workspace('IDE', [{ panel: 'terminal' }, { panel: 'files' }, { panel: 'changes' }]),
  workspace('Browse', [{ panel: 'browser', favorite: 'google' }]),
  workspace('Files', [{ panel: 'files' }]),
]
