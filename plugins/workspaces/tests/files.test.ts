import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_FAVORITES } from '../hooks/workspaces/defaults.ts'
import { freeId, load, patchWorkspace } from '../hooks/workspaces/files.ts'
import { DIR, HOME, memDisk } from './fakes.ts'

const FAVS = `${HOME}/.glyphh/favorites.json`
const names = async (w: ReturnType<typeof memDisk>) => (await load(w.disk)).entries.map(e => e.file.name)

describe('first run', () => {
  test('writes the built-in workspaces and favourites; none names a folder', async () => {
    const w = memDisk()
    const { entries, favorites } = await load(w.disk)
    expect(entries.map(e => e.slug)).toEqual(['comms', 'ide', 'browse', 'files'])
    expect(favorites).toEqual(DEFAULT_FAVORITES)
    expect(favorites.find(f => f.id === 'slack')).toMatchObject({ url: 'https://app.slack.com/client', keep_in_panel: true })
    expect(JSON.parse(w.files.get(FAVS)!).favorites).toHaveLength(4)
    expect(w.json('comms').cells).toEqual([
      { panel: 'browser', favorite: 'gmail', col: 0, row: 0, row_span: 2 },
      { panel: 'browser', favorite: 'slack', col: 1, row: 0 },
      { panel: 'browser', favorite: 'calendar', col: 1, row: 1 },
    ])
    expect(entries.every(e => e.file.folder === null)).toBe(true)
    expect([...w.files.keys()].some(k => k.endsWith('.tmp'))).toBe(false)
  })

  test('later runs read: a deleted workspace stays deleted, an emptied folder stays empty', async () => {
    const w = memDisk()
    await load(w.disk)
    w.files.delete(`${DIR}/files.json`)
    expect(await names(w)).toEqual(['Comms', 'IDE', 'Browse'])
    for (const slug of ['comms', 'ide', 'browse']) w.files.delete(`${DIR}/${slug}.json`)
    w.files.set(`${DIR}/notes.txt`, 'kept')
    expect(await names(w)).toEqual([])
  })

  test('without HOME there is nowhere to keep them', async () => {
    await expect(load(memDisk(null).disk)).rejects.toThrow('HOME is not set')
  })
})

describe('migration from earlier versions', () => {
  test("pages become favourites, one per address, and the files point at them", async () => {
    const w = memDisk()
    w.files.set(`${DIR}/comms.json`, JSON.stringify({ name: 'Comms', tabs: [{ url: 'https://mail.google.com', name: 'mail.google.com' }, { url: 'https://app.slack.com', name: 'Slack' }] }))
    w.files.set(
      `${DIR}/mix.json`,
      JSON.stringify({ name: 'Mix', cols: 2, rows: 1, cells: [{ panel: 'browser', col: 0, row: 0, tab: 0 }, { panel: 'editor', col: 1, row: 0 }], tabs: [{ url: 'https://mail.google.com', name: 'Mail' }] }),
    )
    const { entries, favorites } = await load(w.disk)
    expect(favorites).toEqual([
      { id: 'mail-google-com', name: 'mail.google.com', url: 'https://mail.google.com', keep_in_panel: false },
      { id: 'slack', name: 'Slack', url: 'https://app.slack.com', keep_in_panel: false },
    ])
    expect(w.json('mix').cells).toEqual([{ panel: 'browser', col: 0, row: 0, favorite: 'mail-google-com' }, { panel: 'files', col: 1, row: 0 }])
    expect(w.json('comms').tabs).toBeUndefined()
    expect(entries.map(e => e.file.name)).toEqual(['Comms', 'Mix'])
    const again = await load(w.disk) // nothing left to migrate
    expect(again.favorites).toEqual(favorites)
  })

  test('a favourites file is read as kept; what is not a favourite is passed over', async () => {
    const w = memDisk()
    w.files.set(`${DIR}/a.json`, JSON.stringify({ name: 'A', cols: 1, rows: 1, cells: [] }))
    w.files.set(FAVS, JSON.stringify({ favorites: [{ id: 'x', name: 'X', url: 'https://x.com' }, { id: 'y', name: 'Y', url: 'https://y.com', keep_in_panel: true }, { id: 'x', name: 'Dup', url: 'https://d.com' }, { id: 1 }, null] }))
    expect((await load(w.disk)).favorites).toEqual([
      { id: 'x', name: 'X', url: 'https://x.com', keep_in_panel: false },
      { id: 'y', name: 'Y', url: 'https://y.com', keep_in_panel: true },
    ])
    w.files.set(FAVS, 'not json')
    expect((await load(w.disk)).favorites).toEqual([])
  })

  test('without a favourites file and with nothing to migrate, there are none', async () => {
    const w = memDisk()
    w.files.set(`${DIR}/a.json`, JSON.stringify({ name: 'A', cols: 1, rows: 1, cells: [] }))
    expect((await load(w.disk)).favorites).toEqual([])
    expect(JSON.parse(w.files.get(FAVS)!)).toEqual({ favorites: [] })
  })
})

describe('writing workspaces', () => {
  test('reading: the kept order first, new files after by name; junk is passed over', async () => {
    const w = memDisk()
    for (const n of ['b', 'a', 'c']) w.files.set(`${DIR}/${n}.json`, JSON.stringify({ name: n.toUpperCase(), cols: 1, rows: 1, cells: [] }))
    w.files.set(`${DIR}/broken.json`, '{')
    await w.order.set(['c'])
    expect(await names(w)).toEqual(['C', 'A', 'B'])
  })

  test('patch changes one file in place; a workspace gone says so', async () => {
    const w = memDisk()
    await load(w.disk)
    await patchWorkspace(w.disk, 'Files', f => ({ ...f, folder: '/code' }))
    expect(w.json('files').folder).toBe('/code')
    await expect(patchWorkspace(w.disk, 'Nope', f => f)).rejects.toThrow('There is no workspace "Nope".')
  })

  test('ids come from names and never repeat', () => {
    expect(freeId('Gmail', [{ id: 'gmail', name: 'Gmail', url: '', keep_in_panel: false }])).toBe('gmail-2')
    expect(freeId('***', [])).toBe('page')
  })
})
