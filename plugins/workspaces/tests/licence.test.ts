import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { DAY_MS } from '../hooks/licence/access.ts'
import { SITE_SIGNED_OTHER_MOD } from './fakes.ts'
import { T0, runCommand, startSession, world } from './engine.ts'

const ENDED = 'The Workspaces trial has ended. Unlock it for $5 in /workspaces.'

/** A session with the layout page's helper running, as after /stream. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on)
  await startSession($)
  const run = (command: string, args?: string) => runCommand($, command, args)
  await run('workspaces')
  await clock.advance(1000) // the licence's state goes to the page
  return { ...w, clock, run, last: () => w.helper.licence.at(-1) }
}

describe('licence in the layout page', () => {
  test('during the trial the page is told the days left, once while it stays the same', async ($, on) => {
    const { last, clock, helper } = await started($, on)
    expect(last()).toMatchObject({ kind: 'trial', trial: 'Trial · 7 days left', isWaiting: false, price: '$5', command: '/workspaces' })
    expect(JSON.stringify(last())).not.toContain('licence"')
    const sent = helper.licence.length
    await clock.advance(1000)
    expect(helper.licence).toHaveLength(sent)
  })

  test('on day 6 the page is told 1 day is left', async ($, on) => {
    const { last } = await started($, on, { trialStartedAt: T0 - DAY_MS * 6 })
    expect(last()).toMatchObject({ trial: 'Trial · 1 day left' })
  })

  test('after the trial the page is locked; /dip, /stream, the panes and page_read refuse; /workspaces still opens it', async ($, on) => {
    const { last, run } = await started($, on, { trialStartedAt: T0 - DAY_MS * 7 })
    expect(last()).toMatchObject({ kind: 'expired', trial: null, about: expect.arrayContaining([expect.stringContaining('Workspaces sets up')]) })
    expect(await run('dip', 'IDE')).toBe(ENDED)
    expect(await run('dip')).toBe(ENDED)
    expect(await run('stream')).toBe(ENDED)
    expect(await run('files')).toBe(ENDED)
    expect(((await $.tool.call({ tool: 'mcp__workspaces__page_read', input: {} } as never)) as { result?: unknown }).result).toEqual({ error: ENDED })
    expect(await run('workspaces')).toBe('Workspaces: layout page ✓')
  })

  test('the trial counts from the first run, not from each session', async ($, on) => {
    const { run } = await started($, on, { trialStartedAt: T0 - DAY_MS * 7 })
    await startSession($)
    expect(await run('dip', 'IDE')).toBe(ENDED)
  })

  test("the page's Unlock opens checkout and waits; Cancel stops; a licence that does not check out is said", async ($, on) => {
    const { clock, helper, ran, w, last } = await started($, on)
    helper.press('buy')
    await clock.advance(1000)
    const opened = ran.find(a => a[0] === 'open')!
    expect(opened[1]).toStartWith('https://buy.stripe.com/test_8x228k14I6BG7UHayxc7u01?client_reference_id=')
    expect(last()).toMatchObject({ isWaiting: true, note: 'Finish checkout in your browser: Workspaces unlocks on its own.' })
    helper.press('cancel')
    await clock.advance(1000)
    expect(last()).toMatchObject({ isWaiting: false, note: null })

    helper.press('buy')
    w.siteAnswers.push(JSON.stringify({ paid: true, licence: SITE_SIGNED_OTHER_MOD }))
    await clock.advance(3000)
    // The signature check is real crypto: on a slow machine it ends after a
    // second of the test's clock, so the clock moves until the page is told.
    for (let i = 0; i < 20 && last()?.isWaiting; i++) await clock.advance(1000)
    expect(w.siteAsked[0]).toBe(`http://localhost:3000/api/license?mod=workspaces&install=${opened[1]!.split('=')[1]}`)
    expect(last()).toMatchObject({ isWaiting: false, note: 'The licence the site sent did not check out. Press Unlock to try again.' })
  })

  test('where the browser does not open, the checkout link is copied', async ($, on) => {
    const { clock, helper, w, toasts } = await started($, on)
    w.openExit = 1
    helper.press('buy')
    await clock.advance(1000)
    expect(w.copied[0]).toStartWith('https://buy.stripe.com/')
    expect(toasts).toContain('The checkout link is copied: paste it into your browser.')
  })

  test('Copy licence key with no licence says so; an unknown ask is passed over', async ($, on) => {
    const { clock, helper, toasts, w } = await started($, on)
    helper.press('copy')
    helper.press('nonsense')
    await clock.advance(1000)
    expect(toasts).toContain('The licence key could not be copied here.')
    expect(w.copied).toEqual([])
  })

  test('a helper that goes away is sent everything again once one is back', async ($, on) => {
    const { clock, helper, run } = await started($, on)
    const sent = helper.licence.length
    helper.alive = null
    await clock.advance(1000)
    await clock.advance(1000)
    await run('workspaces')
    await clock.advance(1000)
    expect(helper.licence.length).toBeGreaterThan(sent)
  })

  test('/workspaces key: a key for another mod or junk does not unlock; the usage is said', async ($, on) => {
    const { run } = await started($, on, { trialStartedAt: T0 - DAY_MS * 8 })
    expect(await run('workspaces', `key ${SITE_SIGNED_OTHER_MOD}`)).toBe('That licence key did not check out.')
    expect(await run('workspaces', 'key junk')).toBe('That licence key did not check out.')
    expect(await run('workspaces', 'key')).toBe('Usage: /workspaces key <licence>')
    expect(await run('workspaces', 'key a b')).toBe('Usage: /workspaces key <licence>')
    expect(await run('dip')).toBe(ENDED)
  })

  test('a stored licence that no longer checks out is dropped at session start', async ($, on) => {
    const { run } = await started($, on, { licence: SITE_SIGNED_OTHER_MOD, trialStartedAt: T0 - DAY_MS * 30 })
    expect(await run('dip')).toBe(ENDED)
  })
})
