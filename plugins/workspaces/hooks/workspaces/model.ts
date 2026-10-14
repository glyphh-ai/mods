// A workspace file: its fields, a new one, and one read from disk made whole.
import type { Pane, Tab, WorkspaceFile } from '../../types'

export const PANES: readonly Pane[] = ['files', 'editor', 'changes', 'terminal', 'browser']
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'] as const
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export const PANE_LABELS: Record<Pane, string> = {
  files: 'Files',
  editor: 'Editor',
  changes: 'Changes',
  terminal: 'Terminal',
  browser: 'Browser',
}

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'
}

/** A page's URL as typed (`gmail.com` is https), or null when it is not one. */
export function urlOf(raw: string): string | null {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return null
  const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    return new URL(url).protocol.startsWith('http') ? url : null
  } catch {
    return null
  }
}

/** A tab named after its site: `https://www.example.com/x` is `example.com`. */
export function tabFor(url: string): Tab {
  return { url, name: new URL(url).host.replace(/^www\./, '') }
}

export function blankFile(name: string): WorkspaceFile {
  return {
    name,
    folder: null,
    model: null,
    permission_mode: null,
    effort: null,
    desktop_panes: [],
    collapse_sidebar: false,
    tabs: [],
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

function tabsOf(v: unknown): Tab[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((t: unknown) => {
    const url = text((t as { url?: unknown } | null)?.url)
    if (!url) return []
    const name = text((t as { name?: unknown }).name)
    return [{ url, name: name ?? url }]
  })
}

/** A file as read, made whole: what is missing or malformed takes its
 *  default, and fields this version does not use are left behind. */
export function normalise(raw: unknown): WorkspaceFile | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const name = text(f.name)
  if (!name) return null
  const panes = Array.isArray(f.desktop_panes) ? f.desktop_panes : []
  return {
    name,
    folder: text(f.folder),
    model: text(f.model),
    permission_mode: text(f.permission_mode),
    effort: text(f.effort),
    desktop_panes: PANES.filter(p => panes.includes(p)).sort((a, b) => panes.indexOf(a) - panes.indexOf(b)),
    collapse_sidebar: f.collapse_sidebar === true,
    tabs: tabsOf(f.tabs),
  }
}
