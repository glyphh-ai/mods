import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { DAY_MS } from '../hooks/licence/access.ts'
import { SITE_SIGNED_OTHER_MOD } from './fakes.ts'
import { PANE, T0, runCommand, startSession, world } from './engine.ts'

const ENDED = 'The Workspaces trial has ended. Unlock it for $5 in /workspaces.'

async function started($: Engine, on: On, store: Record<string, unknown> = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on)
  const fetched: string[] = []
  const answers: string[] = []
  on('http.fetch', (_$, e) => {
    fetched.push(e.url)
    return { value: { ok: true, status: 200, headers: {}, text: answers.shift() ?? '{"paid":false}' } }
  })
  await startSession($)
  const run = (command: string, args?: string) => runCommand($, command, args)
  return { ...w, clock, run, fetched, answers, restart: () => startSession($) }
}

const texts = async (ui: { findAll(q: { type: string }): Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

describe('licence in the engine', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: during the trial the pane says the days left above the workspaces`, async ($, on) => {
      const { clock } = await started($, on)
      await clock.advance(DAY_MS * 6)
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await texts(ui)).toContain('Trial: 1 day left')
      expect(await ui.find({ type: 'Button', key: 'licence-buy' })).toMatchObject({ props: { label: 'Unlock — $5' } })
      expect(await ui.find({ type: 'Input', key: 'ws-new' })).toBeDefined()
    })
  }

  test('after the trial the pane sells Workspaces, and /dip and the panes refuse', async ($, on) => {
    const { clock, run } = await started($, on)
    await clock.advance(DAY_MS * 7)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const shown = await texts(ui)
    expect(shown).toContain('Workspaces sets up the Claude desktop app for a kind of work in one command.')
    expect(shown).toContain('The 7-day trial has ended. Unlock Workspaces for $5, once.')
    expect(await ui.find({ type: 'Input', key: 'ws-new' })).toBeUndefined()
    expect(await run('dip', 'IDE')).toBe(ENDED)
    expect(await run('dip')).toBe(ENDED)
    expect(await run('files')).toBe(ENDED)
    expect(await run('workspaces')).toBe('Workspaces open.')
  })

  test('the trial counts from the first run, not from each session', async ($, on) => {
    const { clock, restart, run } = await started($, on)
    await clock.advance(DAY_MS * 7)
    await restart()
    expect(await run('dip', 'IDE')).toBe(ENDED)
  })

  test('Unlock opens checkout for this install and waits; Cancel stops; a licence that does not check out is said', async ($, on) => {
    const { clock, ran, fetched, answers } = await started($, on)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'licence-buy' })
    const opened = ran.find(a => a[0] === 'open')!
    expect(opened[1]).toStartWith('https://buy.stripe.com/test_8x228k14I6BG7UHayxc7u01?client_reference_id=')
    expect(await texts(ui)).toContain('Finish checkout in your browser: Workspaces unlocks on its own.')
    await ui.press({ key: 'licence-cancel' })
    expect(await ui.find({ type: 'Button', key: 'licence-buy' })).toBeDefined()
    await clock.advance(3_000)
    expect(fetched).toEqual([])

    await ui.press({ key: 'licence-buy' })
    answers.push(JSON.stringify({ paid: true, licence: SITE_SIGNED_OTHER_MOD }))
    await clock.advance(3_000)
    const install = opened[1]!.split('=')[1]
    expect(fetched).toEqual([`http://localhost:3000/api/license?mod=workspaces&install=${install}`])
    expect(await texts(ui)).toContain('The licence the site sent did not check out. Press Unlock to try again.')
  })

  test('where the browser does not open, the checkout link is copied', async ($, on) => {
    const { w, toasts } = await started($, on)
    w.openExit = 1
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'licence-buy' })
    expect(w.copied[0]).toStartWith('https://buy.stripe.com/')
    expect(toasts).toContain('The checkout link is copied: paste it into your browser.')
  })

  test('/workspaces key: a key for another mod or junk does not unlock; the usage is said', async ($, on) => {
    const { run, clock } = await started($, on)
    expect(await run('workspaces', `key ${SITE_SIGNED_OTHER_MOD}`)).toBe('That licence key did not check out.')
    expect(await run('workspaces', 'key junk')).toBe('That licence key did not check out.')
    expect(await run('workspaces', 'key')).toBe('Usage: /workspaces key <licence>')
    expect(await run('workspaces', 'key a b')).toBe('Usage: /workspaces key <licence>')
    await clock.advance(DAY_MS * 8)
    expect(await run('dip')).toBe(ENDED)
  })

  test('a stored licence that no longer checks out is dropped at session start', async ($, on) => {
    const { run } = await started($, on, { licence: SITE_SIGNED_OTHER_MOD, trialStartedAt: T0 - DAY_MS * 30 })
    expect(await run('dip')).toBe(ENDED)
  })
})
