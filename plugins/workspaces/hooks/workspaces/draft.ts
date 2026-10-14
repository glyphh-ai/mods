// A workspace being made or changed in the pane: the app's Add/Edit form as
// data. Changes stay in the draft; Save turns it into a file, or says why not.
import type { Draft, Entry, Favorite, FileCell, Panel, WorkspaceFile } from '../../types'
import { PANE_PANELS, PANEL_LABELS, defaultGrid, evenSizes, fitCells, MAX_GRID } from './model.ts'

/** The app's check on a workspace name: null when it can be saved. */
export function nameError(name: string, existing: readonly string[]): string | null {
  const n = name.trim()
  if (!n) return 'Give the workspace a name.'
  if (n.length > 60) return 'Keep the name under 60 characters.'
  if (existing.some(e => e.trim().toLowerCase() === n.toLowerCase())) return `A workspace named "${n}" already exists.`
  return null
}

export const blankDraft = (): Draft => ({
  original: null,
  name: '',
  folder: '',
  cols: 1,
  rows: 1,
  widths: '',
  heights: '',
  cells: [],
  error: null,
  isConfirmingDelete: false,
})

/** Sizes as the form shows them: percents, or blank for an even split. */
function sizesText(sizes: number[]): string {
  const even = sizes.every(s => Math.abs(s - 1 / sizes.length) < 0.005)
  return even ? '' : sizes.map(s => Math.round(s * 100)).join(' ')
}

export function draftOf(file: WorkspaceFile): Draft {
  return {
    ...blankDraft(),
    original: file.name,
    name: file.name,
    folder: file.folder ?? '',
    cols: file.cols,
    rows: file.rows,
    widths: sizesText(file.col_widths),
    heights: sizesText(file.row_heights),
    cells: file.cells.map(c => ({ ...c })),
  }
}

/** The grid at a new size: cells outside it go, sizes even out. */
export function withGrid(d: Draft, cols: number, rows: number): Draft {
  const c = Math.max(1, Math.min(MAX_GRID, cols))
  const r = Math.max(1, Math.min(MAX_GRID, rows))
  return {
    ...d,
    cols: c,
    rows: r,
    widths: c === d.cols ? d.widths : '',
    heights: r === d.rows ? d.heights : '',
    cells: fitCells(d.cells, c, r),
    error: null,
  }
}

/** A choice in a cell's drop-down: '' (empty), an app pane, or `fav:<id>`. */
export const choiceOf = (cell: FileCell | undefined): string => (!cell ? '' : cell.favorite ? `fav:${cell.favorite}` : cell.panel)

export function choices(favorites: Favorite[]): { value: string; label: string }[] {
  return [
    { value: '', label: 'Empty' },
    ...favorites.map(f => ({ value: `fav:${f.id}`, label: f.name })),
    ...PANE_PANELS.map(p => ({ value: p, label: PANEL_LABELS[p] })),
  ]
}

/** The slot at col,row shows `choice` (keeping its height). */
export function withChoice(d: Draft, col: number, row: number, choice: string): Draft {
  const was = d.cells.find(c => c.col === col && c.row === row)
  const rest = d.cells.filter(c => c !== was)
  if (!choice) return { ...d, cells: rest, error: null }
  const span = was?.row_span ? { row_span: was.row_span } : {}
  const cell: FileCell = choice.startsWith('fav:')
    ? { panel: 'browser', col, row, ...span, favorite: choice.slice(4) }
    : { panel: choice as Panel, col, row, ...span }
  return { ...d, cells: fitCells([...rest, cell], d.cols, d.rows), error: null }
}

/** The cell at col,row grows down `span` rows; cells it now covers go. */
export function withSpan(d: Draft, col: number, row: number, span: number): Draft {
  const cell = d.cells.find(c => c.col === col && c.row === row)
  if (!cell) return d
  const grown: FileCell = { ...cell, row_span: span }
  const covered = new Set(Array.from({ length: span }, (_, i) => `${col},${row + i}`))
  const rest = d.cells.filter(c => c !== cell && !(c.col === col && covered.has(`${c.col},${c.row}`)))
  return { ...d, cells: fitCells([grown, ...rest], d.cols, d.rows), error: null }
}

/** The slots the form lists, column by column: each free top-left of a cell. */
export function slots(d: Draft): { col: number; row: number; cell?: FileCell; maxSpan: number }[] {
  const covered = new Set(d.cells.flatMap(c => Array.from({ length: (c.row_span ?? 1) - 1 }, (_, i) => `${c.col},${c.row + 1 + i}`)))
  const out = []
  for (let col = 0; col < d.cols; col++) {
    for (let row = 0; row < d.rows; row++) {
      if (covered.has(`${col},${row}`)) continue
      out.push({ col, row, cell: d.cells.find(c => c.col === col && c.row === row), maxSpan: d.rows - row })
    }
  }
  return out
}

/** The app's starter layouts, as far as this mod's cells go. */
export const STARTERS = { blank: 'Blank', email: 'Email', dev: 'Dev' } as const
export type Starter = keyof typeof STARTERS

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
const byHost = (favorites: Favorite[], host: string) => favorites.find(f => hostOf(f.url) === host)

export function withStarter(d: Draft, starter: Starter, favorites: Favorite[]): Draft {
  const page = (host: string): Pick<FileCell, 'panel' | 'favorite'>[] => {
    const f = byHost(favorites, host)
    return f ? [{ panel: 'browser', favorite: f.id }] : []
  }
  const items = {
    blank: [],
    email: [...page('mail.google.com'), ...page('calendar.google.com')],
    dev: [{ panel: 'terminal' as const }, { panel: 'files' as const }, { panel: 'changes' as const }],
  }[starter]
  const grid = defaultGrid(items)
  return { ...d, cols: grid.cols, rows: grid.rows, widths: '', heights: '', cells: grid.cells, error: null }
}

/** Sizes typed as percents (any numbers, scaled to fit); blank is even. */
export function parseSizes(text: string, n: number): number[] | null {
  if (!text.trim()) return evenSizes(n)
  const parts = text.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== n || !parts.every(x => Number.isFinite(x) && x > 0)) return null
  const sum = parts.reduce((a, b) => a + b, 0)
  return parts.map(x => x / sum)
}

/** The draft as a file to save, or the reason it cannot be. */
export function fileOf(d: Draft, entries: Entry[], favorites: Favorite[]): { file: WorkspaceFile } | { error: string } {
  const others = entries.map(e => e.file.name).filter(n => n !== d.original)
  const bad = nameError(d.name, others)
  if (bad) return { error: bad }
  const folder = d.folder.trim()
  if (folder && !folder.startsWith('/')) return { error: 'The folder must be an absolute path, or blank.' }
  const widths = parseSizes(d.widths, d.cols)
  if (!widths) return { error: `Column widths: give ${d.cols} number${d.cols === 1 ? '' : 's'}, or leave it blank.` }
  const heights = parseSizes(d.heights, d.rows)
  if (!heights) return { error: `Row heights: give ${d.rows} number${d.rows === 1 ? '' : 's'}, or leave it blank.` }
  const seen = new Set<string>()
  for (const c of d.cells) {
    if (!c.favorite) continue
    const fav = favorites.find(f => f.id === c.favorite)
    if (!fav) return { error: 'A cell shows a favourite that no longer exists: pick another.' }
    if (seen.has(fav.id)) return { error: `${fav.name} is in this workspace twice: a page can be shown once.` }
    seen.add(fav.id)
  }
  return {
    file: {
      name: d.name.trim(),
      folder: folder || null,
      cols: d.cols,
      rows: d.rows,
      col_widths: widths,
      row_heights: heights,
      cells: fitCells(d.cells, d.cols, d.rows),
    },
  }
}

/** The list's line for a workspace: "3 cells · Gmail, Slack, Calendar". */
export function summaryOf(file: WorkspaceFile, favorites: Favorite[]): string {
  const n = file.cells.length
  if (n === 0) return 'No cells'
  const names = file.cells.map(c => (c.favorite ? (favorites.find(f => f.id === c.favorite)?.name ?? '?') : PANEL_LABELS[c.panel]))
  return `${n} cell${n === 1 ? '' : 's'} · ${names.join(', ')}`
}
