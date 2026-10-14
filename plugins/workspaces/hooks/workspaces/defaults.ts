// The workspaces a first run writes to ~/.glyphh/workspaces: generic for
// anyone, so none names a folder (the session stays where it is).
import type { WorkspaceFile } from '../../types'
import { blankFile } from './model.ts'

export const DEFAULTS: WorkspaceFile[] = [
  {
    ...blankFile('Comms'),
    desktop_panes: ['browser'],
    tabs: [
      { url: 'https://mail.google.com', name: 'Gmail' },
      { url: 'https://app.slack.com', name: 'Slack' },
      { url: 'https://calendar.google.com', name: 'Calendar' },
    ],
  },
  // Files last: the pane opened last keeps its place in front.
  { ...blankFile('IDE'), desktop_panes: ['terminal', 'changes', 'files'], collapse_sidebar: true },
  { ...blankFile('Browse'), desktop_panes: ['browser'], tabs: [{ url: 'https://www.google.com', name: 'Google' }] },
  { ...blankFile('Files'), desktop_panes: ['files'] },
]
