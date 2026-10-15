import { describe, expect, test } from 'claude-code/testing'

import * as E from '../helper/echo-model.mjs'

const favorites = [
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com' },
  { id: 'docs', name: 'Docs', url: 'https://docs.google.com' },
]
const workspaces = [
  { file: { name: 'Comms', cells: [{ panel: 'browser', favorite: 'gmail' }, { panel: 'browser', favorite: 'slack' }, { panel: 'terminal' }] } },
  { file: { name: 'Wide', cells: [1, 2, 3, 4, 5].map(() => ({ panel: 'files' })) } },
]
const tiles = E.tilesFrom({ workspaces, favorites })
const keys = (list: { key: string }[]) => list.map(t => t.key)
const state = (over: Partial<E.EchoState> = {}): E.EchoState => ({ order: [], dock: [...E.DEFAULT_DOCK], folders: [], ...over })
const card = (id: string, fav: string, over: Partial<E.Card> = {}): E.Card => ({ id, fav, solo: false, pinned: false, ...over })
const band = { left: 0, top: 0, width: 1007, height: 607 }

describe('the wall: tiles, order, pages', () => {
  test('every favourite, then every workspace as a mini of its first four cells', () => {
    expect(keys(tiles)).toEqual(['fav:gmail', 'fav:slack', 'fav:docs', 'layout:Comms', 'layout:Wide'])
    expect(tiles[0]).toEqual({ key: 'fav:gmail', kind: 'fav', name: 'Gmail', url: 'https://mail.google.com', fav: 'gmail' })
    expect(tiles[3]?.cells).toEqual([
      { url: 'https://mail.google.com', name: 'Gmail' },
      { url: 'https://app.slack.com', name: 'Slack' },
      { panel: 'terminal', name: 'terminal' },
    ])
    expect(tiles[4]?.cells).toHaveLength(4)
    const lost = E.tilesFrom({ workspaces: [{ file: { name: 'X', cells: [{ panel: 'browser', favorite: 'gone' }] } }], favorites: [] })
    expect(lost[0]?.cells).toEqual([{ url: '', name: '?' }])
  })

  test("the dock's own items, in order", () => {
    expect(E.DEFAULT_DOCK).toEqual(['closeall', 'workspaces', 'newfav'])
    expect(E.dockItemFor('workspaces')).toEqual({ key: 'workspaces', title: 'Workspaces' })
    expect(E.dockItemFor('fav:gmail')).toBeNull()
  })

  test('dock on: what it carries leaves the wall; dock off: it leads the wall, no duplicates', () => {
    const t = (key: string) => ({ key })
    const dockItems = [t('closeall'), t('fav:slack')]
    const wallItems = [t('fav:gmail'), t('fav:slack'), t('fav:gmail'), t('layout:Comms')]
    const keyOf = (x: { key: string }) => x.key
    expect(keys(E.wallTilesFor({ dockEnabled: true, dockItems, wallItems, keyOf }))).toEqual(['fav:gmail', 'layout:Comms'])
    expect(keys(E.wallTilesFor({ dockEnabled: false, dockItems, wallItems, keyOf }))).toEqual(['closeall', 'fav:slack', 'fav:gmail', 'layout:Comms'])
    // An item with no key is never folded away.
    expect(E.wallTilesFor({ dockEnabled: false, dockItems: [], wallItems: [1, 2], keyOf: () => null })).toEqual([1, 2])
  })

  test('the dock keeps its own items and live tiles when the library changes', () => {
    expect(E.keepDockKeys(['closeall', 'fav:gone', 'fav:gmail', 'folder:f1', 'workspaces'], tiles)).toEqual(['closeall', 'fav:gmail', 'folder:f1', 'workspaces'])
  })

  test('the kept order first, new tiles after; a folder stands for its tiles', () => {
    expect(keys(E.orderWall(tiles, { order: ['layout:Comms', 'fav:gone', 'fav:docs', 'fav:docs'] }))).toEqual(['layout:Comms', 'fav:docs', 'fav:gmail', 'fav:slack', 'layout:Wide'])
    const folders = [{ id: 'f1', name: 'Mail', keys: ['fav:gmail', 'fav:slack'] }]
    const wall = E.orderWall(tiles, { order: ['fav:docs', 'folder:f1'], folders })
    expect(keys(wall)).toEqual(['fav:docs', 'folder:f1', 'layout:Comms', 'layout:Wide'])
    expect(wall[1]).toEqual({ key: 'folder:f1', kind: 'folder', name: 'Mail', folder: 'f1', cells: [{ url: 'https://mail.google.com', name: 'Gmail' }, { url: 'https://app.slack.com', name: 'Slack' }] })
    expect(keys(E.orderWall(tiles))).toEqual(keys(tiles))
  })

  test("a folder's tile shows its first four members that still exist", () => {
    const f = E.folderTile({ id: 'f', name: 'F', keys: ['fav:gone', 'layout:Comms', 'fav:docs'] }, tiles)
    expect(f.cells).toEqual([{ url: '', name: 'Comms' }, { url: 'https://docs.google.com', name: 'Docs' }])
  })

  test('pages of a size, always at least one', () => {
    expect(E.pagesOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(E.pagesOf([], 24)).toEqual([[]])
  })

  test('a key moved before another, or to the end', () => {
    expect(E.moveKey(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(E.moveKey(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
    expect(E.moveKey(['a', 'b'], 'x', 'nope')).toEqual(['a', 'b', 'x'])
  })
})

describe('folders', () => {
  test('a tile dropped on another makes a folder where that one stood', () => {
    const s = E.createFolder(state({ order: ['fav:gmail', 'fav:slack', 'fav:docs'] }), 'fav:docs', 'fav:gmail', 'f1')
    expect(s.order).toEqual(['folder:f1', 'fav:slack'])
    expect(s.folders).toEqual([{ id: 'f1', name: 'Folder', keys: ['fav:gmail', 'fav:docs'] }])
    // Not onto itself, nor a folder into a folder.
    const s0 = state({ order: ['fav:gmail'] })
    expect(E.createFolder(s0, 'fav:gmail', 'fav:gmail', 'f')).toBe(s0)
    expect(E.createFolder(s0, 'folder:x', 'fav:gmail', 'f')).toBe(s0)
    expect(E.createFolder(s0, 'fav:gmail', 'folder:x', 'f')).toBe(s0)
    // A target not yet in the order: the folder goes at the end.
    expect(E.createFolder(state(), 'fav:a', 'fav:b', 'f2').order).toEqual(['folder:f2'])
  })

  test('a tile dropped on a folder joins it; once only', () => {
    const s = E.createFolder(state({ order: ['fav:gmail', 'fav:slack', 'fav:docs'] }), 'fav:slack', 'fav:gmail', 'f1')
    const t = E.addToFolder(s, 'fav:docs', 'f1')
    expect(t.folders[0]?.keys).toEqual(['fav:gmail', 'fav:slack', 'fav:docs'])
    expect(t.order).toEqual(['folder:f1'])
    expect(E.addToFolder(t, 'fav:docs', 'f1')).toBe(t)
    expect(E.addToFolder(t, 'fav:x', 'nope')).toBe(t)
    expect(E.addToFolder(t, 'folder:f1', 'f1')).toBe(t)
  })

  test('dragged out: back on the wall after the folder; the last one out removes it', () => {
    let s = state({ order: ['fav:docs', 'folder:f1'], folders: [{ id: 'f1', name: 'Mail', keys: ['fav:gmail', 'fav:slack'] }] })
    s = E.removeFromFolder(s, 'fav:gmail', 'f1')
    expect(s.order).toEqual(['fav:docs', 'folder:f1', 'fav:gmail'])
    expect(s.folders[0]?.keys).toEqual(['fav:slack'])
    s = E.removeFromFolder(s, 'fav:slack', 'f1')
    expect(s.order).toEqual(['fav:docs', 'fav:slack', 'fav:gmail'])
    expect(s.folders).toEqual([])
    expect(E.removeFromFolder(s, 'fav:slack', 'f1')).toBe(s)
    // A folder missing from the order: the tile goes to the end.
    const lost = state({ order: ['a'], folders: [{ id: 'f', name: 'F', keys: ['x', 'y'] }] })
    expect(E.removeFromFolder(lost, 'x', 'f').order).toEqual(['a', 'x'])
  })

  test('renamed, trimmed and capped; an empty name changes nothing', () => {
    const s = state({ folders: [{ id: 'f1', name: 'Folder', keys: ['a'] }, { id: 'f2', name: 'Other', keys: ['b'] }] })
    expect(E.renameFolder(s, 'f1', '  Mail  ').folders.map(f => f.name)).toEqual(['Mail', 'Other'])
    expect(E.renameFolder(s, 'f1', 'x'.repeat(80)).folders[0]?.name).toHaveLength(60)
    expect(E.renameFolder(s, 'f1', '   ')).toBe(s)
  })

  test('tiles that left the library leave folders, order and dock; an emptied folder goes', () => {
    const s = state({
      order: ['fav:gone', 'fav:gmail', 'folder:f1', 'folder:f2'],
      dock: ['closeall', 'fav:gone', 'fav:docs'],
      folders: [{ id: 'f1', name: 'A', keys: ['fav:gone'] }, { id: 'f2', name: 'B', keys: ['fav:gone', 'fav:slack'] }],
    })
    const p = E.pruneEcho(s, tiles)
    expect(p.order).toEqual(['fav:gmail', 'folder:f2'])
    expect(p.folders).toEqual([{ id: 'f2', name: 'B', keys: ['fav:slack'] }])
    expect(p.dock).toEqual(['closeall', 'fav:docs'])
  })
})

describe('cards: the flow', () => {
  test('two to a column, then a new column; a solo card keeps its column', () => {
    const ids = (cols: { id: string }[][]) => cols.map(c => c.map(x => x.id))
    expect(ids(E.flowColumns([card('a', '1'), card('b', '2'), card('c', '3')]))).toEqual([['a', 'b'], ['c']])
    expect(ids(E.flowColumns([card('a', '1', { solo: true }), card('b', '2'), card('c', '3'), card('d', '4', { solo: true })]))).toEqual([['a'], ['b', 'c'], ['d']])
  })

  test('seam fractions are kept only for the shape they shaped', () => {
    const cols = [[1, 2], [3]]
    expect(E.syncFractions(cols)).toEqual({ colFr: [1, 1], rowFr: [[1, 1], [1]] })
    expect(E.syncFractions(cols, { colFr: [2, 1], rowFr: [[3, 1], [1]] })).toEqual({ colFr: [2, 1], rowFr: [[3, 1], [1]] })
    expect(E.syncFractions(cols, { colFr: [1, 1, 1], rowFr: [[1]] })).toEqual({ colFr: [1, 1], rowFr: [[1, 1], [1]] })
  })

  test('rects share the band with a gap between, and follow the seams', () => {
    const r = E.flowRects([card('a', '1'), card('b', '2'), card('c', '3')], band)
    expect(E.GAP).toBe(7)
    expect(r.get('a')).toEqual({ left: 0, top: 0, width: 500, height: 300 })
    expect(r.get('b')).toEqual({ left: 0, top: 307, width: 500, height: 300 })
    expect(r.get('c')).toEqual({ left: 507, top: 0, width: 500, height: 607 })
    const s = E.flowRects([card('a', '1'), card('b', '2')], { left: 10, top: 20, width: 1000, height: 607 }, { colFr: [1], rowFr: [[3, 1]] })
    expect(s.get('a')).toEqual({ left: 10, top: 20, width: 1000, height: 450 })
    expect(s.get('b')).toEqual({ left: 10, top: 477, width: 1000, height: 150 })
    // Never smaller than a usable card.
    const tiny = E.flowRects([card('a', '1')], { left: 0, top: 0, width: 50, height: 50 })
    expect(tiny.get('a')).toEqual({ left: 0, top: 0, width: 160, height: 110 })
  })

  test('opening a favourite: never two copies; a pinned card takes it', () => {
    const cards = [card('a', 'gmail')]
    expect(E.openFavorite(cards, 'gmail', 'b')).toBe(cards)
    expect(E.openFavorite(cards, 'slack', 'b')).toEqual([card('a', 'gmail'), card('b', 'slack')])
    expect(E.openFavorite([card('a', 'gmail', { pinned: true }), card('b', 'docs')], 'slack', 'c')).toEqual([card('a', 'slack', { pinned: true }), card('b', 'docs')])
  })

  test('dragged onto another: the two trade places, the place keeps its own column', () => {
    const cards = [card('a', '1', { solo: true }), card('b', '2'), card('c', '3')]
    expect(E.swapCards(cards, 'a', 'c')).toEqual([card('c', '3', { solo: true }), card('b', '2'), card('a', '1')])
    expect(E.swapCards(cards, 'a', 'a')).toBe(cards)
    expect(E.swapCards(cards, 'a', 'x')).toBe(cards)
  })

  test("dropped at the band's side: a column of its own at that side", () => {
    const cards = [card('a', '1'), card('b', '2'), card('c', '3')]
    expect(E.soloCard(cards, 'b', 'left')).toEqual([card('b', '2', { solo: true }), card('a', '1'), card('c', '3')])
    expect(E.soloCard(cards, 'a', 'right')).toEqual([card('b', '2'), card('c', '3'), card('a', '1', { solo: true })])
    expect(E.soloCard(cards, 'x', 'left')).toBe(cards)
  })

  test('one pinned card at most; pinning it again unpins it', () => {
    const cards = E.pinCard([card('a', '1', { pinned: true }), card('b', '2')], 'b')
    expect(cards.map(c => c.pinned)).toEqual([false, true])
    expect(E.pinCard(cards, 'b').map(c => c.pinned)).toEqual([false, false])
  })
})

describe('cards: a workspace grid', () => {
  const layout: E.ViewerLayoutLike = {
    name: 'Comms',
    colWidths: [3, 1],
    rowHeights: [1, 1],
    cells: [
      { panel: 'browser', col: 0, row: 0, rowSpan: 2, page: 'gmail', url: 'https://mail.google.com', title: 'Gmail', keepInPanel: true },
      { panel: 'browser', col: 1, row: 0, page: 'slack', url: 'https://app.slack.com' },
      { panel: 'terminal', col: 1, row: 1 },
    ],
  }

  test('the grid from the layout; loose cards showing its favourites move into it', () => {
    const r = E.workspaceGrid(layout, [card('a', 'slack'), card('b', 'docs')])
    expect(r.cards).toEqual([card('b', 'docs')])
    expect(r.grid.workspace).toBe('Comms')
    expect(r.grid.cells).toEqual([
      { id: 'g0', col: 0, row: 0, colSpan: 1, rowSpan: 2, fav: 'gmail', panel: 'browser', url: 'https://mail.google.com', title: 'Gmail', keepInPanel: true },
      { id: 'g1', col: 1, row: 0, colSpan: 1, rowSpan: 1, fav: 'slack', panel: 'browser', url: 'https://app.slack.com', title: null, keepInPanel: false },
      { id: 'g2', col: 1, row: 1, colSpan: 1, rowSpan: 1, fav: null, panel: 'terminal', url: null, title: null, keepInPanel: false },
    ])
  })

  test('cell rects: seams only between cells', () => {
    const { grid } = E.workspaceGrid(layout, [])
    const r = E.gridRects(grid, { left: 0, top: 0, width: 1000, height: 600 })
    expect(r.get('g0')).toEqual({ left: 0, top: 0, width: 746.5, height: 600 })
    expect(r.get('g1')).toEqual({ left: 753.5, top: 0, width: 246.5, height: 296.5 })
    expect(r.get('g2')).toEqual({ left: 753.5, top: 303.5, width: 246.5, height: 296.5 })
    expect(E.gridSeams(grid, { left: 0, top: 0, width: 1000, height: 600 })).toEqual({ cols: [{ index: 0, x: 750 }], rows: [{ index: 0, y: 300 }] })
    const tiny = E.gridRects({ colWidths: [1], rowHeights: [1], cells: [{ id: 'x', col: 0, row: 0 }] }, { left: 0, top: 0, width: 10, height: 10 })
    expect(tiny.get('x')).toEqual({ left: 0, top: 0, width: 120, height: 90 })
  })

  test('a seam slides between its neighbours, never past the minimum', () => {
    expect(E.slideSeam([1, 1], 0, 0.25)).toEqual([0.75, 0.25])
    const round = (f: number[]) => f.map(x => Math.round(x * 1000) / 1000)
    expect(round(E.slideSeam([1, 1], 0, 0.9))).toEqual([0.92, 0.08])
    expect(round(E.slideSeam([1, 1], 0, -0.9))).toEqual([0.08, 0.92])
    expect(E.slideSeam([2, 2], 3, 0.1)).toEqual([0.5, 0.5])
  })

  test('two grid cards trade places and spans', () => {
    const { grid } = E.workspaceGrid(layout, [])
    const g = E.swapCells(grid, 'g0', 'g2')
    expect(g.cells.map(c => [c.id, c.col, c.row, c.rowSpan])).toEqual([['g0', 1, 1, 1], ['g1', 1, 0, 1], ['g2', 0, 0, 2]])
    expect(E.swapCells(grid, 'g0', 'g0')).toBe(grid)
    expect(E.swapCells(grid, 'g0', 'nope')).toBe(grid)
  })

  test('a loose favourite over a grid: its pages become loose cards, ahead of those behind it', () => {
    const { grid } = E.workspaceGrid(layout, [])
    let n = 0
    const out = E.dissolveGrid(grid, [card('x', 'docs'), card('y', 'slack')], () => `n${++n}`)
    expect(out).toEqual([card('n1', 'gmail'), card('n2', 'slack'), card('x', 'docs')])
  })
})

describe('the wall state, kept across sessions', () => {
  test('what is kept: the workspace on stage and the loose cards', () => {
    const { grid } = E.workspaceGrid({ name: 'W', colWidths: [1], rowHeights: [1], cells: [] }, [])
    expect(E.serializeWall({ grid, cards: [card('a', 'gmail', { pinned: true })] })).toEqual({ workspace: 'W', cards: [{ fav: 'gmail', solo: false, pinned: true }] })
    expect(E.serializeWall({ grid: null, cards: [] })).toEqual({ workspace: null, cards: [] })
  })

  test('read back whole; anything malformed is an empty wall', () => {
    expect(E.parseWall({ workspace: 'W', cards: [{ fav: 'a', solo: true }, { fav: 3 }, null] })).toEqual({ workspace: 'W', cards: [card('c0', 'a', { solo: true })] })
    expect(E.parseWall('junk')).toEqual({ workspace: null, cards: [] })
    expect(E.parseEcho(null)).toEqual({ order: [], dock: ['closeall', 'workspaces', 'newfav'], folders: [], wall: { workspace: null, cards: [] } })
    expect(E.parseEcho({ order: ['a', 1], dock: ['fav:x'], folders: [{ id: 'f', name: 'F', keys: ['a', 2] }, { id: 1 }, { id: 'g', name: 'G' }] })).toEqual({
      order: ['a'],
      dock: ['fav:x'],
      folders: [{ id: 'f', name: 'F', keys: ['a'] }, { id: 'g', name: 'G', keys: [] }],
      wall: { workspace: null, cards: [] },
    })
  })

  test('nothing is saved until the kept state is back; then saves fold into one', () => {
    const saved: unknown[] = []
    const timers: (() => void)[] = []
    const cleared: unknown[] = []
    const saver = E.wallSaver({ save: s => saved.push(s), delay: 10, setTimer: fn => timers.push(fn), clearTimer: t => cleared.push(t) })
    expect(saver.schedule({ n: 0 })).toBe(false)
    expect(timers).toHaveLength(0)
    saver.restored()
    expect(saver.schedule({ n: 1 })).toBe(true)
    expect(saver.schedule({ n: 2 })).toBe(true)
    expect(cleared).toEqual([1])
    timers[1]?.()
    expect(saved).toEqual([{ n: 2 }])
    expect(saver.schedule({ n: 3 })).toBe(true)
    expect(cleared).toEqual([1])
  })
})

describe('the dock and the swipe', () => {
  test('magnification: largest under the pointer, falling off with distance', () => {
    expect(E.dockScales([0, 100], null)).toEqual([1, 1])
    expect(E.dockScales([0, 100], 0, 1)).toEqual([1, 1])
    const [a, b, c] = E.dockScales([0, 110, 1000], 0)
    expect(a).toBe(1.25)
    expect(b).toBe(1 + 0.25 * Math.exp(-0.5))
    expect(Math.abs((c ?? 0) - 1)).toBeLessThan(1e-6)
  })

  test('the dock tucks away when it auto-hides and cards are up', () => {
    expect(E.dockTucked({ autoHide: true, cardsUp: true })).toBe(true)
    expect(E.dockTucked({ autoHide: true, cardsUp: false })).toBe(false)
    expect(E.dockTucked({ autoHide: false, cardsUp: true })).toBe(false)
  })

  test('a swipe: mostly sideways, past the threshold, not in the cooldown', () => {
    expect(E.swipeStep({ dx: 80, dy: 10, threshold: 50 })).toBe(1)
    expect(E.swipeStep({ dx: -80, dy: 10, threshold: 50 })).toBe(-1)
    expect(E.swipeStep({ dx: 40, dy: 0, threshold: 50 })).toBe(0)
    expect(E.swipeStep({ dx: 80, dy: 90, threshold: 50 })).toBe(0)
    expect(E.swipeStep({ dx: 80, dy: 0, threshold: 50, sinceLast: 100 })).toBe(0)
    expect(E.swipeStep({ dx: 80, dy: 0, threshold: 50, sinceLast: 500 })).toBe(1)
  })

  test('wheel turns: one page per gesture; a pause starts a new one after the cooldown', () => {
    const s = E.wheelSwipeState()
    expect(E.wheelSwipeFeed(s, 30, 0, 1000)).toBe(0)
    expect(E.wheelSwipeFeed(s, 40, 0, 1010)).toBe(1)
    expect(E.wheelSwipeFeed(s, 200, 0, 1020)).toBe(0) // the same gesture
    expect(E.wheelSwipeFeed(s, -100, 0, 1300)).toBe(0) // a new gesture, inside the cooldown
    expect(E.wheelSwipeFeed(s, -100, 0, 2000)).toBe(-1)
    expect(E.SWIPE_WHEEL_PX).toBe(60)
    expect(E.WHEEL_GESTURE_GAP_MS).toBe(150)
    expect(E.SWIPE_COOLDOWN_MS).toBe(450)
  })
})

describe('the search', () => {
  test('dims what does not match; the best match starts with the query', () => {
    const r = E.searchWall(tiles, 'Do')
    expect([...r.dim]).toEqual(['fav:gmail', 'fav:slack', 'layout:Comms', 'layout:Wide'])
    expect(r.best?.key).toBe('fav:docs')
    expect(E.searchWall(tiles, 'ack').best?.key).toBe('fav:slack')
    expect(E.searchWall(tiles, 'layout:').best?.key).toBe('layout:Comms')
    expect(E.searchWall(tiles, 'zzz')).toEqual({ dim: new Set(keys(tiles)), best: null })
    expect(E.searchWall(tiles, '  ')).toEqual({ dim: new Set(), best: null })
  })
})
