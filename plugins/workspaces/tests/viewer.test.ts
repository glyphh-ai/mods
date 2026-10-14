import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_FAVORITES } from '../hooks/workspaces/defaults.ts'
import { layoutsFor, lineReader, linkTo, parseLine, scrub } from '../hooks/workspaces/viewer.ts'
import type { Entry } from '../types'

const entry = (name: string, cells: Entry['file']['cells']): Entry => ({ slug: name, file: { name, folder: null, cols: 2, rows: 1, col_widths: [0.5, 0.5], row_heights: [1], cells } })

describe('the layout page', () => {
  test('one live page per favourite: the same favourite in two workspaces is the same page', () => {
    const layouts = layoutsFor(
      [
        entry('Comms', [{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }, { panel: 'terminal', col: 1, row: 0, row_span: 1 }]),
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
        { panel: 'browser', col: 0, row: 0, rowSpan: 1, page: 'gmail', url: 'https://mail.google.com', title: 'Gmail' },
        { panel: 'terminal', col: 1, row: 0, rowSpan: 1 },
      ],
    })
    expect(layouts[1]?.cells).toEqual([{ panel: 'browser', col: 1, row: 0, rowSpan: 1, page: 'gmail', url: 'https://mail.google.com', title: 'Gmail' }])
  })

  test("the helper's lines", () => {
    expect(parseLine('{"t":"ready","port":5,"token":"x"}')).toEqual({ t: 'ready', port: 5, token: 'x' })
    expect(parseLine('{"t":"layout","name":"A","colWidths":[1],"rowHeights":[1]}')).toEqual({ t: 'layout', name: 'A', colWidths: [1], rowHeights: [1] })
    expect(parseLine('{"t":"active","name":"A"}')).toEqual({ t: 'active', name: 'A' })
    for (const junk of ['not json', 'null', '{"t":"ready","port":"5"}', '{"t":"layout","name":"A","colWidths":["x"],"rowHeights":[]}', '{"t":"other"}']) {
      expect(parseLine(junk)).toBeNull()
    }
    const read = lineReader()
    expect(read('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
    expect(read(':2}\n\n')).toEqual(['{"b":2}'])
  })

  test('requests carry the token; a refusal is an error', async () => {
    const asked: { url: string; init: { method: string; headers: Record<string, string>; body?: string } }[] = []
    let ok = true
    const link = linkTo(
      async (url, init) => {
        asked.push({ url, init })
        return { ok, text: JSON.stringify({ key: 'k1', open: 2, pages: [{ cell: 'gmail', url: 'u', title: 't' }] }) }
      },
      4100,
      'tok',
    )
    await link.setLayouts([], 'A')
    expect(await link.isOpen()).toBe(true)
    expect(await link.pageUrl()).toBe('http://127.0.0.1:4100/?k=k1')
    expect(await link.pages()).toEqual([{ cell: 'gmail', url: 'u', title: 't' }])
    await link.text('a b')
    expect(asked.map(a => `${a.init.method} ${a.url}`)).toEqual([
      'POST http://127.0.0.1:4100/api/layouts',
      'GET http://127.0.0.1:4100/api/state',
      'POST http://127.0.0.1:4100/api/key',
      'GET http://127.0.0.1:4100/api/state',
      'GET http://127.0.0.1:4100/api/text?cell=a%20b',
    ])
    expect(asked.every(a => a.init.headers['X-Token'] === 'tok')).toBe(true)
    expect(asked[0]?.init.body).toBe('{"layouts":[],"active":"A"}')
    ok = false
    await expect(link.isOpen()).rejects.toThrow('the layout page answered /api/state with an error')
  })

  test('a pages list missing from the answer is none', async () => {
    const link = linkTo(async () => ({ ok: true, text: '{}' }), 1, 't')
    expect(await link.pages()).toEqual([])
    expect(await link.isOpen()).toBe(false)
  })

  test('an error line never carries the token', () => {
    expect(scrub(' failed at /?t=abc and abc \n', 'abc')).toBe('failed at /?t=*** and ***')
    expect(scrub('plain', undefined)).toBe('plain')
  })
})
