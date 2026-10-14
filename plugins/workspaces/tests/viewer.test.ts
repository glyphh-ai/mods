import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_FAVORITES } from '../hooks/workspaces/defaults.ts'
import { HELPER_FILES, layoutsFor, linkTo, parseMessage, versionOf } from '../hooks/workspaces/viewer.ts'
import type { Entry } from '../types'

const entry = (name: string, cells: Entry['file']['cells']): Entry => ({ slug: name, file: { name, folder: null, cols: 2, rows: 1, col_widths: [0.5, 0.5], row_heights: [1], cells } })

describe('the layout page', () => {
  test('one live page per favourite: the same favourite in two workspaces is the same page', () => {
    const layouts = layoutsFor(
      [
        entry('Comms', [{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }, { panel: 'terminal', col: 1, row: 0, row_span: 1, col_span: 1 }]),
        entry('Mail', [{ panel: 'browser', col: 1, row: 0, favorite: 'gmail' }, { panel: 'browser', col: 0, row: 0, favorite: 'gone' }]),
      ],
      DEFAULT_FAVORITES,
    )
    expect(layouts[0]).toEqual({
      name: 'Comms',
      cols: 2,
      rows: 1,
      colWidths: [0.5, 0.5],
      rowHeights: [1],
      cells: [
        { panel: 'browser', col: 0, row: 0, colSpan: 1, rowSpan: 1, page: 'gmail', url: 'https://mail.google.com', title: 'Gmail' },
        { panel: 'terminal', col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      ],
    })
    expect(layouts[1]?.cells).toEqual([{ panel: 'browser', col: 1, row: 0, colSpan: 1, rowSpan: 1, page: 'gmail', url: 'https://mail.google.com', title: 'Gmail' }])
  })

  test("the helper's messages", () => {
    const parse = (text: string) => parseMessage(JSON.parse(text))
    expect(parse('{"t":"layout","name":"A","colWidths":[1],"rowHeights":[1]}')).toEqual({ t: 'layout', name: 'A', colWidths: [1], rowHeights: [1] })
    expect(parse('{"t":"active","name":"A"}')).toEqual({ t: 'active', name: 'A' })
    expect(parse('{"t":"library"}')).toEqual({ t: 'library' })
    expect(parse('{"t":"library","renamed":{"from":"a","to":"b","name":"B","was":"A"}}')).toEqual({ t: 'library', renamed: { from: 'a', to: 'b', name: 'B', was: 'A' } })
    expect(parse('{"t":"library","renamed":{"from":"a"}}')).toEqual({ t: 'library' })
    for (const junk of ['null', '"text"', '{"t":"layout","name":"A","colWidths":["x"],"rowHeights":[]}', '{"t":"other"}']) expect(parse(junk)).toBeNull()
  })

  test("the helper's version follows its code", async () => {
    expect(HELPER_FILES).toContain('viewer.mjs')
    const a = await versionOf(['x', 'y'])
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(await versionOf(['x', 'y'])).toBe(a)
    expect(await versionOf(['x', 'z'])).not.toBe(a)
  })

  test('requests carry the token; a refusal is an error', async () => {
    const asked: { url: string; init: { method: string; headers: Record<string, string>; body?: string } }[] = []
    let ok = true
    const link = linkTo(
      async (url, init) => {
        asked.push({ url, init })
        return { ok, text: JSON.stringify({ key: 'k1', open: 2, version: 'v1', messages: [{ t: 'active', name: 'A' }, { t: 'junk' }], pages: [{ cell: 'gmail', url: 'u', title: 't' }] }) }
      },
      4100,
      'tok',
    )
    await link.setLayouts([], 'A', { workspaces: [], favorites: [] })
    expect(await link.isOpen()).toBe(true)
    expect(await link.pageUrl()).toBe('http://127.0.0.1:4100/?k=k1')
    expect(await link.pageUrl('workspaces')).toBe('http://127.0.0.1:4100/?k=k1&view=workspaces')
    await link.show('favorites')
    expect(await link.pages()).toEqual([{ cell: 'gmail', url: 'u', title: 't' }])
    await link.text('a b')
    expect(await link.version()).toBe('v1')
    expect(await link.inbox()).toEqual([{ t: 'active', name: 'A' }])
    await link.quit()
    expect(asked.map(a => `${a.init.method} ${a.url}`)).toEqual([
      'POST http://127.0.0.1:4100/api/layouts',
      'GET http://127.0.0.1:4100/api/state',
      'POST http://127.0.0.1:4100/api/key',
      'POST http://127.0.0.1:4100/api/key',
      'POST http://127.0.0.1:4100/api/show',
      'GET http://127.0.0.1:4100/api/state',
      'GET http://127.0.0.1:4100/api/text?cell=a%20b',
      'GET http://127.0.0.1:4100/api/state',
      'GET http://127.0.0.1:4100/api/inbox',
      'POST http://127.0.0.1:4100/api/quit',
    ])
    expect(asked.every(a => a.init.headers['X-Token'] === 'tok')).toBe(true)
    expect(asked[0]?.init.body).toBe('{"layouts":[],"active":"A","library":{"workspaces":[],"favorites":[]}}')
    expect(asked[4]?.init.body).toBe('{"view":"favorites"}')
    ok = false
    await expect(link.isOpen()).rejects.toThrow('the layout page answered /api/state with an error')
  })

  test('lists missing from an answer are empty', async () => {
    const link = linkTo(async () => ({ ok: true, text: '{}' }), 1, 't')
    expect(await link.pages()).toEqual([])
    expect(await link.inbox()).toEqual([])
    expect(await link.version()).toBe('')
    expect(await link.isOpen()).toBe(false)
  })
})
