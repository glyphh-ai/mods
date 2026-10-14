import { describe, expect, test } from 'claude-code/testing'

import * as A from '../hooks/workspaces/actions.ts'
import { loadOrSeed } from '../hooks/workspaces/files.ts'
import type { Entry, Note } from '../types'
import { memDisk, value } from './fakes.ts'

async function world() {
  const w = memDisk()
  const entries = value<Entry[]>(await loadOrSeed(w.disk))
  const ctx = {
    disk: w.disk,
    entries,
    active: value<string | null>('Comms'),
    previous: value<string | null>('IDE'),
    selected: value<string | null>('Comms'),
    note: value<Note | null>(null),
  }
  return { ...w, ctx, names: () => entries.now().map(e => e.file.name), said: () => ctx.note.now() }
}

describe('workspace actions', () => {
  test('create: named, selected, listed; a blank or taken name says why', async () => {
    const w = await world()
    await A.create(w.ctx, '  ')
    expect(w.said()).toEqual({ text: 'Give the workspace a name.', isError: true })
    await A.create(w.ctx, ' Research ')
    expect(w.said()).toEqual({ text: 'Workspace "Research" created.', isError: false })
    expect(w.names().at(-1)).toBe('Research')
    expect(w.ctx.selected.now()).toBe('Research')
    await A.create(w.ctx, 'IDE')
    expect(w.said()).toEqual({ text: 'There is already a workspace "IDE".', isError: true })
  })

  test('rename: the selection, the open workspace and the one before follow', async () => {
    const w = await world()
    await A.rename(w.ctx, 'Comms', 'Comms')
    expect(w.said()).toBeNull()
    await A.rename(w.ctx, 'Comms', 'Mail')
    expect(w.names()[0]).toBe('Mail')
    expect([w.ctx.selected.now(), w.ctx.active.now()]).toEqual(['Mail', 'Mail'])
    await A.rename(w.ctx, 'IDE', 'Code')
    expect(w.ctx.previous.now()).toBe('Code')
  })

  test('delete: gone from the list, nothing points at it', async () => {
    const w = await world()
    await A.remove(w.ctx, 'Comms')
    expect(w.names()).toEqual(['IDE', 'Browse', 'Files'])
    expect([w.ctx.selected.now(), w.ctx.active.now(), w.ctx.previous.now()]).toEqual([null, null, 'IDE'])
  })

  test('fields: saved, blank clears, a relative folder is refused', async () => {
    const w = await world()
    await A.setField(w.ctx, 'Comms', 'model', 'opus')
    await A.setField(w.ctx, 'Comms', 'permission_mode', 'plan')
    await A.setField(w.ctx, 'Comms', 'effort', 'high')
    await A.setField(w.ctx, 'Comms', 'folder', '/Users/me/code')
    expect(w.json('comms')).toMatchObject({ model: 'opus', permission_mode: 'plan', effort: 'high', folder: '/Users/me/code' })
    expect(w.said()?.text).toBe('Comms: folder saved.')
    await A.setField(w.ctx, 'Comms', 'folder', 'code')
    expect(w.said()).toEqual({ text: 'The folder must be an absolute path.', isError: true })
    await A.setField(w.ctx, 'Comms', 'model', '')
    expect(w.json('comms').model).toBeNull()
  })

  test('panes and sidebar toggle; a pane put back opens last', async () => {
    const w = await world()
    await A.togglePane(w.ctx, 'IDE', 'terminal')
    expect(w.json('ide').desktop_panes).toEqual(['changes', 'files'])
    await A.togglePane(w.ctx, 'IDE', 'terminal')
    expect(w.json('ide').desktop_panes).toEqual(['changes', 'files', 'terminal'])
    await A.toggleSidebar(w.ctx, 'IDE')
    expect(w.json('ide').collapse_sidebar).toBe(false)
  })

  test('tabs: added by address, removed by place; not an address says so', async () => {
    const w = await world()
    await A.addTab(w.ctx, 'Comms', 'notion.so')
    expect(w.json('comms').tabs.at(-1)).toEqual({ url: 'https://notion.so', name: 'notion.so' })
    await A.addTab(w.ctx, 'Comms', 'not a url')
    expect(w.said()).toEqual({ text: '"not a url" is not a web address.', isError: true })
    await A.removeTab(w.ctx, 'Comms', 0)
    expect(w.json('comms').tabs.map((t: { name: string }) => t.name)).toEqual(['Slack', 'Calendar', 'notion.so'])
  })

  test('a workspace gone from disk says so', async () => {
    const w = await world()
    await A.toggleSidebar(w.ctx, 'Nope')
    expect(w.said()).toEqual({ text: 'There is no workspace "Nope".', isError: true })
  })
})
