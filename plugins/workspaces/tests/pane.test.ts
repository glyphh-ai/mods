import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { PANE, T0, world, type WorldOptions } from './engine.ts'

const DIR = '/home/t/.glyphh/workspaces'

async function mounted($: Engine, on: On, surface: 'terminal' | 'desktop', options?: WorldOptions) {
  mock.store(on)
  mock.clock(on, { now: T0 })
  const w = world(on, options)
  await $.session.start({ cwd: '/proj', surface, isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface })
  const json = (slug: string) => JSON.parse(w.files.get(`${DIR}/${slug}.json`)!)
  return { ...w, ui, json }
}

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`${surface}: the workspaces pane`, () => {
    test('lists the workspaces and edits the one picked', async ($, on) => {
      const { ui, json } = await mounted($, on, surface)
      expect((await ui.findAll({ type: 'Button' })).filter((b: { key?: string }) => b.key?.startsWith('ws-pick-'))).toHaveLength(4)
      expect(await ui.find({ type: 'Input', key: 'ws-rename' })).toBeUndefined()

      await ui.press({ key: 'ws-pick-comms' })
      expect((await ui.find({ type: 'Button', key: 'ws-pick-comms' }))?.text).toContain('› 1 Comms')
      await ui.input({ key: 'ws-folder', text: '/Users/me/mail' })
      await ui.input({ key: 'ws-model', text: 'opus' })
      await ui.select({ key: 'ws-permission', value: 'plan' })
      await ui.select({ key: 'ws-effort', value: 'high' })
      await ui.press({ key: 'ws-pane-terminal' })
      await ui.press({ key: 'ws-sidebar' })
      await ui.input({ key: 'ws-tab-add', text: 'notion.so' })
      await ui.press({ key: 'ws-tab-remove-0' })
      expect(json('comms')).toEqual({
        name: 'Comms',
        folder: '/Users/me/mail',
        model: 'opus',
        permission_mode: 'plan',
        effort: 'high',
        desktop_panes: ['browser', 'terminal'],
        collapse_sidebar: true,
        tabs: [
          { url: 'https://app.slack.com', name: 'Slack' },
          { url: 'https://calendar.google.com', name: 'Calendar' },
          { url: 'https://notion.so', name: 'notion.so' },
        ],
      })
      expect(await ui.find({ type: 'Text', text: 'Comms: tab removed.' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'ws-pane-terminal' })).toMatchObject({ props: { variant: 'primary' } })

      await ui.input({ key: 'ws-rename', text: 'Mail' })
      expect(json('mail').name).toBe('Mail')
      await ui.press({ key: 'ws-delete' })
      expect((await ui.findAll({ type: 'Button' })).filter((b: { key?: string }) => b.key?.startsWith('ws-pick-'))).toHaveLength(3)
    })

    test('makes a new workspace and says what went wrong', async ($, on) => {
      const { ui, json } = await mounted($, on, surface)
      await ui.input({ key: 'ws-new', text: 'Research' })
      expect(json('research')).toMatchObject({ name: 'Research', desktop_panes: [], tabs: [] })
      expect(await ui.find({ type: 'Text', text: 'No tabs.' })).toBeDefined()
      await ui.input({ key: 'ws-folder', text: 'relative' })
      expect(await ui.find({ type: 'Text', text: 'The folder must be an absolute path.' })).toMatchObject({ props: { color: 'error' } })
    })
  })
}

test('with HOME unknown the pane says there is nowhere to keep workspaces', async ($, on) => {
  const { ui } = await mounted($, on, 'desktop', { home: null })
  expect(await ui.find({ type: 'Text', text: 'HOME is not set: there is nowhere to keep workspaces.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No workspaces yet: name one below.' })).toBeDefined()
})

test('a file that cannot be removed is said', async ($, on) => {
  const { ui } = await mounted($, on, 'desktop', { rmFails: true })
  await ui.press({ key: 'ws-pick-files' })
  await ui.press({ key: 'ws-delete' })
  expect(await ui.find({ type: 'Text', text: `Could not remove ${DIR}/files.json: Operation not permitted` })).toBeDefined()
})

test('on mobile the pane says where workspaces are edited', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  world(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await ui.find({ type: 'Text', text: 'Workspaces are edited on the desktop or in a terminal.' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'licence-buy' })).toBeDefined()
})
