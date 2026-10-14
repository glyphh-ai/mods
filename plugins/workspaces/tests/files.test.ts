import { describe, expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/workspaces/defaults.ts'
import { addWorkspace, deleteWorkspace, loadOrSeed, patchWorkspace, readAll, renameWorkspace } from '../hooks/workspaces/files.ts'
import { blankFile } from '../hooks/workspaces/model.ts'
import { DIR, memDisk } from './fakes.ts'

const names = async (w: ReturnType<typeof memDisk>) => (await readAll(w.disk)).map(e => e.file.name)

describe('workspace files', () => {
  test('first run: the built-in workspaces are written, in order, and none names a folder', async () => {
    const w = memDisk()
    const entries = await loadOrSeed(w.disk)
    expect(entries.map(e => e.slug)).toEqual(['comms', 'ide', 'browse', 'files'])
    expect(w.order.now()).toEqual(['comms', 'ide', 'browse', 'files'])
    expect(w.json('comms').tabs.map((t: { name: string }) => t.name)).toEqual(['Gmail', 'Slack', 'Calendar'])
    expect(w.json('ide')).toMatchObject({ desktop_panes: ['terminal', 'changes', 'files'], collapse_sidebar: true })
    expect(DEFAULTS.every(f => f.folder === null)).toBe(true)
    expect(w.files.get(`${DIR}/files.json`)).toEndWith('}\n')
  })

  test('later runs read the files: one deleted stays deleted, an emptied folder stays empty', async () => {
    const w = memDisk()
    await loadOrSeed(w.disk)
    w.files.delete(`${DIR}/files.json`)
    expect((await loadOrSeed(w.disk)).map(e => e.file.name)).toEqual(['Comms', 'IDE', 'Browse'])
    for (const slug of ['comms', 'ide', 'browse']) w.files.delete(`${DIR}/${slug}.json`)
    w.files.set(`${DIR}/notes.txt`, 'kept')
    expect(await loadOrSeed(w.disk)).toEqual([])
  })

  test('reading: the kept order first, new files after by name; junk is passed over', async () => {
    const w = memDisk()
    expect(await readAll(w.disk)).toEqual([])
    w.files.set(`${DIR}/b.json`, JSON.stringify({ name: 'B' }))
    w.files.set(`${DIR}/a.json`, JSON.stringify({ name: 'A' }))
    w.files.set(`${DIR}/c.json`, JSON.stringify({ name: 'C' }))
    w.files.set(`${DIR}/broken.json`, '{')
    w.files.set(`${DIR}/nameless.json`, '{}')
    await w.order.set(['c'])
    expect(await names(w)).toEqual(['C', 'A', 'B'])
  })

  test('without HOME there is nowhere to keep them', async () => {
    const w = memDisk(null)
    await expect(loadOrSeed(w.disk)).rejects.toThrow('HOME is not set')
  })

  test('add: a free slug, last in order; a name taken is refused', async () => {
    const w = memDisk()
    await loadOrSeed(w.disk)
    w.files.set(`${DIR}/research.json`, JSON.stringify({ name: 'Old research' }))
    await addWorkspace(w.disk, blankFile('Research'))
    expect(w.json('research-2').name).toBe('Research')
    expect(w.order.now().at(-1)).toBe('research-2')
    await expect(addWorkspace(w.disk, blankFile('comms'))).rejects.toThrow('There is already a workspace "comms".')
  })

  test('rename: the file follows the name and keeps its place', async () => {
    const w = memDisk()
    await loadOrSeed(w.disk)
    await renameWorkspace(w.disk, 'Comms', 'Mail')
    expect(w.files.has(`${DIR}/comms.json`)).toBe(false)
    expect(w.json('mail').name).toBe('Mail')
    expect(await names(w)).toEqual(['Mail', 'IDE', 'Browse', 'Files'])

    await renameWorkspace(w.disk, 'IDE', 'ide') // same slug: rewritten in place
    expect(w.json('ide').name).toBe('ide')
    await expect(renameWorkspace(w.disk, 'Mail', 'files')).rejects.toThrow('There is already a workspace "files".')
    await expect(renameWorkspace(w.disk, 'Nope', 'X')).rejects.toThrow('There is no workspace "Nope".')
  })

  test('patch and delete', async () => {
    const w = memDisk()
    await loadOrSeed(w.disk)
    await patchWorkspace(w.disk, 'Files', f => ({ ...f, folder: '/code' }))
    expect(w.json('files').folder).toBe('/code')
    await deleteWorkspace(w.disk, 'Files')
    expect(w.files.has(`${DIR}/files.json`)).toBe(false)
    expect(w.order.now()).toEqual(['comms', 'ide', 'browse'])
    await expect(deleteWorkspace(w.disk, 'Files')).rejects.toThrow('There is no workspace "Files".')
  })
})
