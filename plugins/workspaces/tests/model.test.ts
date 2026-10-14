import { describe, expect, test } from 'claude-code/testing'

import { defaultGrid, fitCells, normalise, onceEach, sizesOf, slugOf, summaryOf, urlOf } from '../hooks/workspaces/model.ts'

const ids = (tab: { url: string }) => `id:${tab.url}`

describe('workspace model', () => {
  test('slugs and addresses', () => {
    expect(slugOf('Comms & Mail!')).toBe('comms-mail')
    expect(slugOf('***')).toBe('workspace')
    expect(urlOf(' gmail.com ')).toBe('https://gmail.com')
    expect(urlOf('http://localhost:3000/x')).toBe('http://localhost:3000/x')
    for (const bad of ['', 'two words', 'file:///etc/hosts', 'https://']) expect(urlOf(bad)).toBeNull()
  })

  test('the grid for contents without one: square-ish, the first column taller', () => {
    expect(defaultGrid([])).toEqual({ cols: 1, rows: 1, col_widths: [1], row_heights: [1], cells: [] })
    const three = defaultGrid([{ panel: 'browser', favorite: 'a' }, { panel: 'browser', favorite: 'b' }, { panel: 'files' }])
    expect(three).toMatchObject({ cols: 2, rows: 2 })
    expect(three.cells).toEqual([
      { panel: 'browser', favorite: 'a', col: 0, row: 0, row_span: 2 },
      { panel: 'browser', favorite: 'b', col: 1, row: 0 },
      { panel: 'files', col: 1, row: 1 },
    ])
    expect(defaultGrid([{ panel: 'files' }, { panel: 'changes' }]).cells.map(c => [c.col, c.row])).toEqual([[0, 0], [1, 0]])
    const five = defaultGrid(Array.from({ length: 5 }, () => ({ panel: 'files' as const })))
    expect([five.cols, five.rows, five.cells.length]).toEqual([3, 2, 5])
    const eight = defaultGrid(Array.from({ length: 8 }, () => ({ panel: 'files' as const })))
    expect(eight.cells.filter(c => c.col === 0)).toEqual([
      { panel: 'files', col: 0, row: 0 },
      { panel: 'files', col: 0, row: 1, row_span: 2 },
    ])
  })

  test('cells fit the grid: outside goes, spans are cut, none on another', () => {
    expect(
      fitCells(
        [
          { panel: 'files', col: 0, row: 0, row_span: 5 },
          { panel: 'changes', col: 0, row: 1 },
          { panel: 'terminal', col: 2, row: 0 },
          { panel: 'terminal', col: 1, row: -1 },
          { panel: 'terminal', col: 1, row: 0, row_span: 1 },
        ],
        2,
        2,
      ),
    ).toEqual([{ panel: 'files', col: 0, row: 0, row_span: 2 }, { panel: 'terminal', col: 1, row: 0 }])
  })

  test('merged cells: wide and tall, cut to the grid, and none over another', () => {
    expect(
      fitCells(
        [
          { panel: 'files', col: 0, row: 0, col_span: 5, row_span: 1 },
          { panel: 'changes', col: 1, row: 0 },
          { panel: 'terminal', col: 0, row: 1, col_span: 2, row_span: 1 },
        ],
        2,
        2,
      ),
    ).toEqual([{ panel: 'files', col: 0, row: 0, col_span: 2 }, { panel: 'terminal', col: 0, row: 1, col_span: 2 }])
  })

  test('summaries', () => {
    const file = { name: 'A', folder: null, cols: 2, rows: 1, col_widths: [0.5, 0.5], row_heights: [1], cells: [{ panel: 'browser' as const, col: 0, row: 0, favorite: 'gmail' }, { panel: 'terminal' as const, col: 1, row: 0 }] }
    expect(summaryOf(file, [{ id: 'gmail', name: 'Gmail', url: 'u' }])).toBe('2 cells · Gmail, Terminal')
    expect(summaryOf({ ...file, cells: [file.cells[0]!] }, [])).toBe('1 cell · ?')
    expect(summaryOf({ ...file, cells: [] }, [])).toBe('No cells')
  })

  test('sizes: fractions that sum to 1, else even', () => {
    expect(sizesOf([3, 1], 2)).toEqual([0.75, 0.25])
    expect(sizesOf([1], 2)).toEqual([0.5, 0.5])
    expect(sizesOf([1, -1], 2)).toEqual([0.5, 0.5])
    expect(sizesOf('x', 1)).toEqual([1])
  })

  test('a favourite shows once per workspace', () => {
    expect(onceEach([{ panel: 'browser', col: 0, row: 0, favorite: 'a' }, { panel: 'browser', col: 1, row: 0, favorite: 'a' }, { panel: 'files', col: 2, row: 0 }])).toHaveLength(2)
  })
})

describe('reading a workspace file', () => {
  test("this version's file reads as written", () => {
    const file = { name: 'Comms', folder: '/code', cols: 3, rows: 1, col_widths: [0.4, 0.3, 0.3], row_heights: [1], cells: [{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }, { panel: 'terminal', col: 1, row: 0, col_span: 2 }] }
    expect(normalise(file, ids)).toEqual({ file, isLegacy: false })
  })

  test("the first version's grid file: pages become favourites, old cell kinds map", () => {
    const old = {
      name: 'IDE',
      model: 'opus',
      cols: 3,
      rows: 2,
      col_widths: [0.2, 0.5, 0.3],
      row_heights: [0.6, 0.4],
      cells: [
        { panel: 'tree', col: 0, row: 0 },
        { panel: 'diff', col: 0, row: 1 },
        { panel: 'browser', col: 1, row: 0, tab: 0 },
        { panel: 'browser', col: 1, row: 1, tab: 7 },
        { panel: 'claude', col: 2, row: 0, row_span: 2 },
        { panel: 'nope', col: 2, row: 1 },
      ],
      tabs: [{ url: 'https://mail.google.com', name: 'mail', no_redirect: false, rpa: {} }],
    }
    expect(normalise(old, ids)).toEqual({
      file: {
        name: 'IDE',
        folder: null,
        cols: 3,
        rows: 2,
        col_widths: [0.2, 0.5, 0.3],
        row_heights: [0.6, 0.4],
        cells: [
          { panel: 'files', col: 0, row: 0 },
          { panel: 'changes', col: 0, row: 1 },
          { panel: 'browser', col: 1, row: 0, favorite: 'id:https://mail.google.com' },
        ],
      },
      isLegacy: true,
    })
  })

  test('a file without a grid (tabs and panes) gets one', () => {
    const read = normalise(
      { name: 'Comms', tabs: [{ url: 'https://a.com' }, { url: 'https://b.com', name: 'B' }, { name: 'no url' }], desktop_panes: ['browser', 'terminal', 'editor', 'files'] },
      ids,
    )
    expect(read?.isLegacy).toBe(true)
    expect(read?.file.cells.map(c => c.favorite ?? c.panel)).toEqual(['id:https://a.com', 'id:https://b.com', 'files', 'terminal'])
    expect(read?.file).toMatchObject({ cols: 2, rows: 2 })
  })

  test('something that is not a workspace is not read as one', () => {
    expect(normalise(null, ids)).toBeNull()
    expect(normalise('Comms', ids)).toBeNull()
    expect(normalise({ name: ' ' }, ids)).toBeNull()
    expect(normalise({ name: 'Bare', cols: 30, rows: 1, cells: [] }, ids)?.file).toMatchObject({ cols: 1, rows: 1, cells: [] })
  })
})
