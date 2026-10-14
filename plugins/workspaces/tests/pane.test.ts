import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { DIR, PANE, T0, world, type WorldOptions } from './engine.ts'

const FAVS = '/home/t/.glyphh/favorites.json'

async function mounted($: Engine, on: On, surface: 'terminal' | 'desktop', options?: WorldOptions) {
  mock.store(on)
  mock.clock(on, { now: T0 })
  const w = world(on, options)
  await $.session.start({ cwd: '/proj', surface, isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface })
  const text = async (t: string | RegExp) => (await ui.find({ type: 'Text', text: t }))?.text
  const favorites = () => JSON.parse(w.files.get(FAVS)!).favorites as { id: string; name: string; url: string }[]
  return { ...w, ui, text, favorites }
}

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`${surface}: the workspaces list`, () => {
    test('shows each workspace with its shape, and opens one as /dip does', async ($, on) => {
      const { ui, text, helper, w } = await mounted($, on, surface)
      expect(await text('3 cells · Gmail, Slack, Calendar')).toBeDefined()
      expect(await text('3 cells · Terminal, Files, Changes')).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'ws-open-comms' })).toBeDefined()
      await ui.press({ key: 'ws-open-comms' })
      expect(helper.layouts.at(-1)?.active).toBe('Comms')
      expect(w.closed).toContain('workspaces')
    })

    test('new → save writes a workspace file; validation refuses first', async ($, on) => {
      const { ui, text, json } = await mounted($, on, surface)
      await ui.press({ key: 'ws-new' })
      expect(await text('New workspace')).toBeDefined()
      await ui.press({ key: 'ws-save' })
      expect(await text('Give the workspace a name.')).toBeDefined()
      await ui.input({ key: 'ws-name', text: 'comms', kind: 'change' })
      await ui.press({ key: 'ws-save' })
      expect(await text('A workspace named "comms" already exists.')).toBeDefined()

      await ui.input({ key: 'ws-name', text: 'Mail', kind: 'change' })
      await ui.input({ key: 'ws-folder', text: '/Users/me/mail', kind: 'change' })
      await ui.select({ key: 'ws-cols', value: '2' })
      await ui.select({ key: 'ws-cell-0-0', value: 'fav:gmail' })
      await ui.select({ key: 'ws-cell-1-0', value: 'fav:gmail' })
      await ui.press({ key: 'ws-save' })
      expect(await text('Gmail is in this workspace twice: a page can be shown once.')).toBeDefined()
      await ui.select({ key: 'ws-cell-1-0', value: 'terminal' })
      await ui.input({ key: 'ws-widths', text: '70 30', kind: 'change' })
      await ui.press({ key: 'ws-save' })

      expect(json('mail')).toEqual({
        name: 'Mail',
        folder: '/Users/me/mail',
        cols: 2,
        rows: 1,
        col_widths: [0.7, 0.3],
        row_heights: [1],
        cells: [
          { panel: 'browser', col: 0, row: 0, favorite: 'gmail' },
          { panel: 'terminal', col: 1, row: 0 },
        ],
      })
      expect(await text('Workspace "Mail" saved.')).toBeDefined()
      expect(await text('2 cells · Gmail, Terminal')).toBeDefined()
    })

    test('edit → save updates the file, a new name moves it; a starter layout fills the grid', async ($, on) => {
      const { ui, json, files, text } = await mounted($, on, surface)
      await ui.press({ key: 'ws-edit-browse' })
      expect((await ui.find({ type: 'Input', key: 'ws-name' }))?.props.value).toBe('Browse')
      await ui.select({ key: 'ws-starter', value: 'email' })
      expect((await ui.find({ type: 'Select', key: 'ws-cell-1-0' }))?.props.value).toBe('fav:calendar')
      await ui.select({ key: 'ws-rows', value: '2' })
      await ui.select({ key: 'ws-span-0-0', value: '2' })
      await ui.input({ key: 'ws-name', text: 'Mail and cal', kind: 'change' })
      await ui.press({ key: 'ws-save' })
      expect(files.has(`${DIR}/browse.json`)).toBe(false)
      expect(json('mail-and-cal').cells).toEqual([
        { panel: 'browser', col: 0, row: 0, favorite: 'gmail', row_span: 2 },
        { panel: 'browser', col: 1, row: 0, favorite: 'calendar' },
      ])
      await ui.press({ key: 'ws-edit-mail-and-cal' })
      await ui.input({ key: 'ws-heights', text: '1', kind: 'change' })
      await ui.press({ key: 'ws-save' })
      expect(await text('Row heights: give 2 numbers, or leave it blank.')).toBeDefined()
      await ui.press({ key: 'ws-cancel' })
      expect(await ui.find({ type: 'Button', key: 'ws-new' })).toBeDefined()
    })

    test('delete asks first, then removes the file', async ($, on) => {
      const { ui, files } = await mounted($, on, surface)
      await ui.press({ key: 'ws-edit-files' })
      await ui.press({ key: 'ws-delete' })
      await ui.press({ key: 'ws-delete-keep' })
      expect(files.has(`${DIR}/files.json`)).toBe(true)
      await ui.press({ key: 'ws-delete' })
      await ui.press({ key: 'ws-delete-confirm' })
      expect(files.has(`${DIR}/files.json`)).toBe(false)
      expect(await ui.find({ type: 'Button', key: 'ws-open-files' })).toBeUndefined()
    })
  })

  describe(`${surface}: favourites`, () => {
    test('add, rename, change the address; the cells keep pointing at them', async ($, on) => {
      const { ui, text, favorites, json } = await mounted($, on, surface)
      await ui.press({ key: 'ws-favorites' })
      expect(await text('in Comms')).toBeDefined()
      await ui.press({ key: 'fav-new' })
      await ui.input({ key: 'fav-name', text: 'Notion', kind: 'change' })
      await ui.input({ key: 'fav-url', text: 'not an address', kind: 'change' })
      await ui.press({ key: 'fav-save' })
      expect(await text('"not an address" is not a web address.')).toBeDefined()
      await ui.input({ key: 'fav-url', text: 'notion.so', kind: 'change' })
      await ui.press({ key: 'fav-save' })
      expect(favorites().at(-1)).toEqual({ id: 'notion', name: 'Notion', url: 'https://notion.so' })

      await ui.press({ key: 'fav-edit-gmail' })
      await ui.input({ key: 'fav-name', text: 'Mail', kind: 'change' })
      await ui.input({ key: 'fav-url', text: 'https://mail.google.com/mail/u/1', kind: 'change' })
      await ui.press({ key: 'fav-save' })
      expect(favorites()[0]).toEqual({ id: 'gmail', name: 'Mail', url: 'https://mail.google.com/mail/u/1' })
      expect(json('comms').cells[0].favorite).toBe('gmail')
      await ui.press({ key: 'fav-back' })
      expect(await text('3 cells · Mail, Slack, Calendar')).toBeDefined()
    })

    test('a favourite a workspace shows is not deleted; one none shows is', async ($, on) => {
      const { ui, text, favorites } = await mounted($, on, surface)
      await ui.press({ key: 'ws-favorites' })
      await ui.press({ key: 'fav-edit-gmail' })
      await ui.press({ key: 'fav-delete' })
      await ui.press({ key: 'fav-delete-confirm' })
      expect(await text('Comms still shows Gmail: take it out of that workspace first.')).toBeDefined()
      await ui.press({ key: 'fav-cancel' })

      await ui.press({ key: 'fav-new' })
      await ui.input({ key: 'fav-name', text: 'Spare', kind: 'change' })
      await ui.input({ key: 'fav-url', text: 'spare.com', kind: 'change' })
      await ui.press({ key: 'fav-save' })
      await ui.press({ key: 'fav-edit-spare' })
      await ui.press({ key: 'fav-delete' })
      await ui.press({ key: 'fav-delete-keep' })
      await ui.press({ key: 'fav-delete' })
      await ui.press({ key: 'fav-delete-confirm' })
      expect(favorites().map(f => f.id)).toEqual(['gmail', 'slack', 'calendar', 'google'])
      expect(await text('Favourite "Spare" deleted.')).toBeDefined()
    })
  })
}

test('the cell drop-down offers Empty, every favourite, and the app panes', async ($, on) => {
  const { ui } = await mounted($, on, 'desktop')
  await ui.press({ key: 'ws-new' })
  const options = (await ui.find({ type: 'Select', key: 'ws-cell-0-0' }))?.props.options as { value: string; label?: string }[]
  expect(options.map(o => o.label)).toEqual(['Empty', 'Gmail', 'Slack', 'Calendar', 'Google', 'Files', 'Changes', 'Terminal'])
  expect(options.map(o => o.value)).toEqual(['', 'fav:gmail', 'fav:slack', 'fav:calendar', 'fav:google', 'files', 'changes', 'terminal'])
})

test('opening a workspace after the trial says so in the list', async ($, on) => {
  mock.store(on, { trialStartedAt: T0 - 8 * 86_400_000 })
  mock.clock(on, { now: T0 })
  world(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'ws-open-comms' })).toBeUndefined()
})

test('opening a workspace outside the desktop app says so in the list', async ($, on) => {
  const { ui, text } = await mounted($, on, 'terminal', { surfaces: ['terminal'] })
  await ui.press({ key: 'ws-open-comms' })
  expect(await text('Workspaces drives the Claude desktop app: run this in a desktop app session.')).toBeDefined()
})

test('a file that cannot be removed is said', async ($, on) => {
  const { ui, text } = await mounted($, on, 'desktop', { rmFails: true })
  await ui.press({ key: 'ws-edit-files' })
  await ui.press({ key: 'ws-delete' })
  await ui.press({ key: 'ws-delete-confirm' })
  expect(await text(`Could not remove ${DIR}/files.json: Operation not permitted`)).toBeDefined()
})

test('with HOME unknown the list says there is nowhere to keep workspaces', async ($, on) => {
  const { text } = await mounted($, on, 'desktop', { home: null })
  expect(await text('HOME is not set: there is nowhere to keep workspaces.')).toBeDefined()
  expect(await text('No workspaces yet.')).toBeDefined()
})

test('the list says what the layout page lacks', async ($, on) => {
  const { text } = await mounted($, on, 'desktop', { noChrome: true })
  expect(await text(/needs Google Chrome/)).toBeDefined()
})

test('on mobile the pane says where workspaces are managed', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  world(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await ui.find({ type: 'Text', text: 'Workspaces are managed on the desktop or in a terminal.' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'licence-buy' })).toBeDefined()
})
