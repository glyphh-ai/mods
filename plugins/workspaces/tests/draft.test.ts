import { describe, expect, test } from 'claude-code/testing'

import { blankDraft, choiceOf, choices, draftOf, fileOf, nameError, parseSizes, slots, summaryOf, withChoice, withGrid, withSpan, withStarter } from '../hooks/workspaces/draft.ts'
import { DEFAULT_FAVORITES } from '../hooks/workspaces/defaults.ts'
import type { Entry, WorkspaceFile } from '../types'

const FILE: WorkspaceFile = {
  name: 'Comms',
  folder: '/code',
  cols: 2,
  rows: 2,
  col_widths: [0.55, 0.45],
  row_heights: [0.5, 0.5],
  cells: [
    { panel: 'browser', col: 0, row: 0, row_span: 2, favorite: 'gmail' },
    { panel: 'terminal', col: 1, row: 0 },
  ],
}
const ENTRIES: Entry[] = [{ slug: 'comms', file: FILE }, { slug: 'ide', file: { ...FILE, name: 'IDE', cells: [] } }]

describe('the workspace form', () => {
  test("the app's name check", () => {
    expect(nameError(' ', [])).toBe('Give the workspace a name.')
    expect(nameError('x'.repeat(61), [])).toBe('Keep the name under 60 characters.')
    expect(nameError('ide', ['IDE'])).toBe('A workspace named "ide" already exists.')
    expect(nameError('New', ['IDE'])).toBeNull()
  })

  test('a file opens as a draft: sizes as percents, even ones blank', () => {
    const d = draftOf(FILE)
    expect(d).toMatchObject({ original: 'Comms', name: 'Comms', folder: '/code', widths: '55 45', heights: '' })
    expect(draftOf({ ...FILE, folder: null }).folder).toBe('')
  })

  test('the grid resized: cells outside go, sizes of a changed count even out', () => {
    const d = withGrid(draftOf(FILE), 1, 1)
    expect(d.cells).toEqual([{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }])
    expect([d.widths, d.heights]).toEqual(['', ''])
    expect(withGrid(draftOf(FILE), 2, 9)).toMatchObject({ rows: 4, widths: '55 45' })
    expect(withGrid(draftOf(FILE), 0, 2).cols).toBe(1)
  })

  test('each slot picks from Empty, the favourites, and the app panes', () => {
    expect(choices(DEFAULT_FAVORITES).map(c => c.value)).toEqual(['', 'fav:gmail', 'fav:slack', 'fav:calendar', 'fav:google', 'files', 'changes', 'terminal'])
    let d = draftOf(FILE)
    d = withChoice(d, 1, 1, 'fav:slack')
    d = withChoice(d, 1, 0, '')
    d = withChoice(d, 0, 0, 'files') // keeps its height
    expect(d.cells).toEqual([
      { panel: 'browser', col: 1, row: 1, favorite: 'slack' },
      { panel: 'files', col: 0, row: 0, row_span: 2 },
    ])
    expect(choiceOf(d.cells[0])).toBe('fav:slack')
    expect(choiceOf(d.cells[1])).toBe('files')
    expect(choiceOf(undefined)).toBe('')
  })

  test('a cell grows down over the cells below it; the slots listed follow', () => {
    let d = withChoice(withChoice(withGrid(blankDraft(), 1, 3), 0, 0, 'files'), 0, 2, 'terminal')
    expect(slots(d).map(s => [s.row, s.maxSpan])).toEqual([[0, 3], [1, 2], [2, 1]])
    d = withSpan(d, 0, 0, 3)
    expect(d.cells).toEqual([{ panel: 'files', col: 0, row: 0, row_span: 3 }])
    expect(slots(d)).toHaveLength(1)
    expect(withSpan(d, 0, 1, 2)).toBe(d)
  })

  test("the app's starter layouts, made of the favourites there are", () => {
    expect(withStarter(blankDraft(), 'email', DEFAULT_FAVORITES).cells.map(c => c.favorite)).toEqual(['gmail', 'calendar'])
    expect(withStarter(blankDraft(), 'email', [{ id: 'x', name: 'X', url: 'not a url' }]).cells).toEqual([])
    expect(withStarter(blankDraft(), 'dev', []).cells.map(c => c.panel)).toEqual(['terminal', 'files', 'changes'])
    expect(withStarter(draftOf(FILE), 'blank', [])).toMatchObject({ cols: 1, rows: 1, cells: [] })
  })

  test('sizes typed: any numbers, scaled; blank is even; the wrong count is refused', () => {
    expect(parseSizes('3, 1', 2)).toEqual([0.75, 0.25])
    expect(parseSizes(' ', 3)).toEqual([1 / 3, 1 / 3, 1 / 3])
    expect(parseSizes('50', 2)).toBeNull()
    expect(parseSizes('50 x', 2)).toBeNull()
  })

  test('save: the file, or the reason it cannot be', () => {
    const d = { ...draftOf(FILE), name: ' Comms ' }
    expect(fileOf(d, ENTRIES, DEFAULT_FAVORITES)).toEqual({ file: { ...FILE, col_widths: [0.55, 0.45] } })
    expect(fileOf({ ...d, name: 'IDE' }, ENTRIES, DEFAULT_FAVORITES)).toEqual({ error: 'A workspace named "IDE" already exists.' })
    expect(fileOf({ ...d, folder: 'code' }, ENTRIES, DEFAULT_FAVORITES)).toEqual({ error: 'The folder must be an absolute path, or blank.' })
    expect(fileOf({ ...d, widths: '1' }, ENTRIES, DEFAULT_FAVORITES)).toEqual({ error: 'Column widths: give 2 numbers, or leave it blank.' })
    expect(fileOf({ ...withGrid(d, 2, 1), heights: '1 1' }, ENTRIES, DEFAULT_FAVORITES)).toEqual({ error: 'Row heights: give 1 number, or leave it blank.' })
    expect(fileOf(d, ENTRIES, [])).toEqual({ error: 'A cell shows a favourite that no longer exists: pick another.' })
    const twice = { ...d, cells: [...d.cells, { panel: 'browser' as const, col: 1, row: 1, favorite: 'gmail' }] }
    expect(fileOf(twice, ENTRIES, DEFAULT_FAVORITES)).toEqual({ error: 'Gmail is in this workspace twice: a page can be shown once.' })
    expect(fileOf({ ...d, folder: ' ' }, ENTRIES, DEFAULT_FAVORITES)).toMatchObject({ file: { folder: null } })
  })

  test("the list's summary", () => {
    expect(summaryOf(FILE, DEFAULT_FAVORITES)).toBe('2 cells · Gmail, Terminal')
    expect(summaryOf({ ...FILE, cells: [FILE.cells[0]!] }, [])).toBe('1 cell · ?')
    expect(summaryOf({ ...FILE, cells: [] }, [])).toBe('No cells')
  })
})
