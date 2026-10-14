import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { PANE, T0, world, type WorldOptions } from './engine.ts'

async function mounted($: Engine, on: On, surface: 'terminal' | 'desktop' | 'mobile', options?: WorldOptions, store?: Record<string, unknown>) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await $.session.start({ cwd: '/proj', surface: surface === 'mobile' ? 'desktop' : surface, isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface })
  const text = async (t: string | RegExp) => (await ui.find({ type: 'Text', text: t }))?.text
  return { ...w, ui, text, clock }
}

for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
  describe(`${surface}: the Workspaces launcher`, () => {
    test('lists each workspace with its shape, and opens one as /dip does', async ($, on) => {
      const { ui, text, helper, w } = await mounted($, on, surface)
      expect(await text('3 cells · Gmail, Slack, Calendar')).toBeDefined()
      expect(await text('3 cells · Terminal, Files, Changes')).toBeDefined()
      await ui.press({ key: 'ws-open-comms' })
      expect(helper.layouts.at(-1)?.active).toBe('Comms')
      expect(w.closed).toContain('workspaces')
    })

    test('Edit in layout page opens the page on its workspace editor, by a one-time address', async ($, on) => {
      const { ui, text, mcp, helper } = await mounted($, on, surface)
      await ui.press({ key: 'ws-edit' })
      expect(mcp).toContain('Claude_Browser.preview_start')
      expect(helper.layouts.at(-1)?.library.workspaces.map(w => w.slug)).toEqual(['comms', 'ide', 'browse', 'files'])
      expect(await text('Editor: layout page ✓')).toBeDefined()
      helper.open = 1 // the page is on screen: it is asked to show its editor
      await ui.press({ key: 'ws-edit' })
      expect(helper.shown).toEqual(['workspaces'])
    })
  })
}

test('where the app refuses, Claude is asked to open the editor page; the address carries no token', async ($, on) => {
  const { ui, asked, clock, helper } = await mounted($, on, 'desktop', { browserRefuses: true })
  await ui.press({ key: 'ws-edit' })
  await clock.settle()
  expect(asked).toEqual([`Open this page in the browser pane (it opens once): http://127.0.0.1:${helper.alive?.port}/?k=once&view=workspaces`])
})

test('after the trial the launcher is the locked page', async ($, on) => {
  const { ui } = await mounted($, on, 'desktop', {}, { trialStartedAt: T0 - 8 * 86_400_000 })
  expect(await ui.find({ type: 'Button', key: 'ws-open-comms' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'licence-buy' })).toBeDefined()
})

test('outside the desktop app, Open and Edit say so', async ($, on) => {
  const { ui, text } = await mounted($, on, 'terminal', { surfaces: ['terminal'] })
  await ui.press({ key: 'ws-edit' })
  expect(await text('Workspaces drives the Claude desktop app: run this in a desktop app session.')).toBeDefined()
})

test('with HOME unknown the launcher says there is nowhere to keep workspaces', async ($, on) => {
  const { text } = await mounted($, on, 'desktop', { home: null })
  expect(await text('HOME is not set: there is nowhere to keep workspaces.')).toBeDefined()
  expect(await text('No workspaces yet: make one in the layout page.')).toBeDefined()
})

test('the launcher says what the layout page lacks', async ($, on) => {
  const { text } = await mounted($, on, 'desktop', { noChrome: true })
  expect(await text(/needs Google Chrome/)).toBeDefined()
})
