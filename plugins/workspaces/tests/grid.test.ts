import { describe, expect, test } from 'claude-code/testing'

import * as G from '../helper/grid.mjs'

const shape = (b: G.Builder) => b.cells.map(c => `${c.content || '-'}@${c.col},${c.row} ${c.colSpan}x${c.rowSpan}`)

describe("the grid builder (the app's layouts.ts)", () => {
  test('a new grid is all empty 1×1 cells, nothing selected', () => {
    const b = G.initCells(2, 1)
    expect(shape(b)).toEqual(['-@0,0 1x1', '-@1,0 1x1'])
    expect(b.selected).toBe(-1)
    expect(G.MAX_GRID).toBe(25)
  })

  test('→ Merge joins a cell with its right neighbour of the same top and height', () => {
    let b = G.initCells(3, 2)
    expect(G.canMergeRight(b, 0)).toBe(true)
    b = G.mergeRight(b, 0)
    expect(shape(b)[0]).toBe('-@0,0 2x1')
    expect(b.selected).toBe(0)
    expect(G.canMergeRight(b, 0)).toBe(true) // 2x1 beside a 1x1 of the same height
    expect(G.canMergeRight(G.initCells(1, 1), 0)).toBe(false) // at the right edge
    const tall = G.mergeDown(G.initCells(2, 2), 1) // right column is 1x2
    expect(G.canMergeRight(tall, 0)).toBe(false) // heights differ
    expect(G.mergeRight(tall, 0)).toBe(tall)
  })

  test('↓ Merge joins a cell with the one below of the same left edge and width', () => {
    let b = G.initCells(2, 3)
    b = G.mergeDown(b, 0)
    expect(shape(b).find(s => s.includes('@0,0'))).toBe('-@0,0 1x2')
    expect(G.canMergeDown(G.initCells(1, 1), 0)).toBe(false)
    const wide = G.mergeRight(G.initCells(2, 2), 2) // bottom row is 2x1
    expect(G.canMergeDown(wide, 0)).toBe(false)
    expect(G.mergeDown(wide, 0)).toBe(wide)
    expect(G.canMergeDown(G.initCells(2, 2), 9)).toBe(false)
  })

  test('Split breaks a merged cell into 1×1 cells; the top-left keeps the content', () => {
    let b = G.mergeDown(G.mergeRight(G.mergeRight(G.initCells(2, 2), 0), 1), 0)
    expect(shape(b)).toEqual(['-@0,0 2x2'])
    b = G.assign(b, 0, 'fav:gmail')
    expect(G.canSplit(b, 0)).toBe(true)
    b = G.split(b, 0)
    expect(shape(b)).toEqual(['fav:gmail@0,0 1x1', '-@1,0 1x1', '-@0,1 1x1', '-@1,1 1x1'])
    expect(G.canSplit(b, 0)).toBe(false)
    expect(G.split(b, 0)).toBe(b)
  })

  test('Cols/Rows resize in place: kept cells keep their content, spans are cut, new places are empty', () => {
    let b = G.assign(G.mergeRight(G.initCells(2, 1), 0), 0, 'files')
    b = G.select(b, 0)
    b = G.resize(b, 3, 2)
    expect(shape(b)).toEqual(['files@0,0 2x1', '-@2,0 1x1', '-@0,1 1x1', '-@1,1 1x1', '-@2,1 1x1'])
    expect(b.selected).toBe(-1)
    b = G.resize(b, 1, 1)
    expect(shape(b)).toEqual(['files@0,0 1x1'])
  })

  test('a file opens in the builder and saves back as its assigned cells', () => {
    const file = {
      cols: 2,
      rows: 2,
      cells: [
        { panel: 'browser', col: 0, row: 0, row_span: 2, favorite: 'gmail' },
        { panel: 'terminal', col: 1, row: 1 },
      ],
    }
    const b = G.fromFile(file)
    expect(shape(b)).toEqual(['fav:gmail@0,0 1x2', '-@1,0 1x1', 'terminal@1,1 1x1'])
    expect(G.fileCells(b)).toEqual([
      { panel: 'browser', col: 0, row: 0, row_span: 2, favorite: 'gmail' },
      { panel: 'terminal', col: 1, row: 1 },
    ])
    expect(G.fileCells(G.mergeRight(G.assign(G.initCells(2, 1), 0, 'files'), 0))).toEqual([{ panel: 'files', col: 0, row: 0, col_span: 2 }])
    expect(shape(G.fromFile({ cols: 0, rows: 0, cells: [{ panel: 'files', col: 5, row: 0 }] }))).toEqual(['-@0,0 1x1', '-@1,0 1x1'])
    expect(G.cellAt(b.cells, 0, 1)).toBe(0)
    expect(G.cellAt(b.cells, 5, 5)).toBe(-1)
  })
})
