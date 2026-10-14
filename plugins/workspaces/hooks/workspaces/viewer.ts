// The layout page's helper as the mod sees it: the layouts it is sent, the
// lines it prints, and the requests the mod makes of it (with the token).
import type { Entry, Favorite, Panel } from '../../types'

/** A cell as the layout page draws it; a browser cell's live page is keyed
 *  by its favourite, so one favourite is one page in every layout. */
export type ViewerCell = { panel: Panel; col: number; row: number; colSpan: number; rowSpan: number; page?: string; url?: string; title?: string }
export type ViewerLayout = { name: string; cols: number; rows: number; colWidths: number[]; rowHeights: number[]; cells: ViewerCell[] }

export function layoutsFor(entries: Entry[], favorites: Favorite[]): ViewerLayout[] {
  return entries.map(({ file }) => ({
    name: file.name,
    cols: file.cols,
    rows: file.rows,
    colWidths: file.col_widths,
    rowHeights: file.row_heights,
    cells: file.cells.flatMap((c): ViewerCell[] => {
      const base = { panel: c.panel, col: c.col, row: c.row, colSpan: c.col_span ?? 1, rowSpan: c.row_span ?? 1 }
      if (c.panel !== 'browser') return [base]
      const fav = favorites.find(f => f.id === c.favorite)
      return fav ? [{ ...base, page: fav.id, url: fav.url, title: fav.name }] : []
    }),
  }))
}

/** A rename the editor made: the file moved from one slug to another. */
export type Renamed = { from: string; to: string; name: string; was: string }

export type ViewerMessage =
  | { t: 'ready'; port: number; token: string }
  | { t: 'layout'; name: string; colWidths: number[]; rowHeights: number[] }
  | { t: 'active'; name: string }
  | { t: 'library'; renamed?: Renamed }

const numbers = (v: unknown): v is number[] => Array.isArray(v) && v.every(x => typeof x === 'number')

/** One line the helper printed, if it is one of its messages. */
export function parseLine(line: string): ViewerMessage | null {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  if (m?.t === 'ready' && typeof m.port === 'number' && typeof m.token === 'string') return { t: 'ready', port: m.port, token: m.token }
  if (m?.t === 'layout' && typeof m.name === 'string' && numbers(m.colWidths) && numbers(m.rowHeights)) {
    return { t: 'layout', name: m.name, colWidths: m.colWidths, rowHeights: m.rowHeights }
  }
  if (m?.t === 'active' && typeof m.name === 'string') return { t: 'active', name: m.name }
  if (m?.t === 'library') {
    const r = m.renamed as Record<string, unknown> | undefined
    const ok = r && ['from', 'to', 'name', 'was'].every(k => typeof r[k] === 'string')
    return ok ? { t: 'library', renamed: r as Renamed } : { t: 'library' }
  }
  return null
}

/** Pieces of output in, whole lines out. */
export function lineReader(): (chunk: string) => string[] {
  let buf = ''
  return chunk => {
    buf += chunk
    const lines = buf.split('\n')
    buf = lines.pop()!
    return lines.filter(Boolean)
  }
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; text: string }>

export type PageInfo = { cell: string; url: string; title: string }

/** The workspaces and favourites, as the layout page's editor reads them. */
export type Library = { workspaces: Entry[]; favorites: Favorite[] }

/** The editor's two lists, the layout page's other view. */
export type EditorView = 'workspaces' | 'favorites'

/** The requests the mod makes of a running helper. */
export type Link = {
  setLayouts(layouts: ViewerLayout[], active: string, library: Library): Promise<void>
  /** Shows the open page's workspace editor. */
  show(view: EditorView): Promise<void>
  /** Whether the layout page is open somewhere (it listens for updates). */
  isOpen(): Promise<boolean>
  /** A one-time address that opens the layout page, on the editor when a view is named. */
  pageUrl(view?: EditorView): Promise<string>
  pages(): Promise<PageInfo[]>
  text(page: string): Promise<unknown>
}

export function linkTo(fetch: Fetch, port: number, token: string): Link {
  const base = `http://127.0.0.1:${port}`
  const ask = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Token': token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!res.ok) throw new Error(`the layout page answered ${path} with an error`)
    return JSON.parse(res.text) as Record<string, unknown>
  }
  return {
    setLayouts: async (layouts, active, library) => void (await ask('/api/layouts', { layouts, active, library })),
    show: async view => void (await ask('/api/show', { view })),
    isOpen: async () => Number((await ask('/api/state')).open) > 0,
    pageUrl: async view => `${base}/?k=${String((await ask('/api/key', {})).key)}${view ? `&view=${view}` : ''}`,
    pages: async () => ((await ask('/api/state')).pages as PageInfo[] | undefined) ?? [],
    text: page => ask(`/api/text?cell=${encodeURIComponent(page)}`),
  }
}

/** A helper's error line, with the token taken out. */
export const scrub = (text: string, token: string | undefined) => (token ? text.replaceAll(token, '***') : text).trim().slice(0, 200)
