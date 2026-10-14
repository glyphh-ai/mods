import type { Timer } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { INITIAL } from '../hooks/licence/access.ts'
import { POLL_MS, WAIT_MS } from '../hooks/licence/config.ts'
import { accept, buy, cancel, start, type Deps } from '../hooks/licence/flow.ts'
import { verify } from '../hooks/licence/verify.ts'
import type { LicenceState } from '../types'
import { payload, sign, testPublicKey, value } from './fakes.ts'

const SITE_URL = 'http://localhost:3000/api/license?mod=workspaces&install='
const LINK = 'https://buy.stripe.com/test_8x228k14I6BG7UHayxc7u01?client_reference_id='

/** Deps in memory: a store, a clock the test moves, timers it fires, the site's answers. */
async function world(entries: Record<string, unknown> = {}) {
  const key = await testPublicKey()
  const store = new Map<string, unknown>(Object.entries(entries))
  const state = value<LicenceState>(INITIAL)
  const timers: { ms: number; fn: () => Promise<void>; cancelled: boolean }[] = []
  const w = {
    now: 1_000_000,
    opens: true,
    copies: true,
    answer: (_url: string): Promise<{ ok: boolean; text: string }> => Promise.resolve({ ok: true, text: '{"paid":false}' }),
    fetched: [] as string[],
    opened: [] as string[],
    copied: [] as string[],
    toasts: [] as string[],
    logs: [] as string[],
  }
  const d: Deps = {
    store: {
      get: async k => store.get(k),
      set: async (k, v) => void store.set(k, v),
      delete: async k => void store.delete(k),
    },
    state,
    now: async () => w.now,
    every: (ms, fn): Timer => {
      const t = { ms, fn, cancelled: false }
      timers.push(t)
      return { cancel: () => void (t.cancelled = true) }
    },
    check: async text => (await verify(text, 'workspaces', key)) !== null,
    fetch: url => {
      w.fetched.push(url)
      return w.answer(url)
    },
    open: async url => {
      w.opened.push(url)
      return w.opens
    },
    copy: async text => {
      w.copied.push(text)
      return w.copies
    },
    toast: text => void w.toasts.push(text),
    log: text => void w.logs.push(text),
  }
  /** Moves the clock one poll on and fires the live timers; resolves when their work is done. */
  const tick = async () => {
    w.now += POLL_MS
    await Promise.all(timers.filter(t => !t.cancelled).map(t => t.fn()))
  }
  const live = () => timers.filter(t => !t.cancelled).length
  return { d, w, store, state, tick, live }
}

describe('session start', () => {
  test('the first run starts the trial, once', async () => {
    const { d, store, state, w } = await world()
    await start(d)
    expect(store.get('trialStartedAt')).toBe(1_000_000)
    w.now += 5_000
    await start(d)
    expect(store.get('trialStartedAt')).toBe(1_000_000)
    expect(state.now()).toEqual({ licence: null, trialStartedAt: 1_000_000, isWaiting: false, note: null })
  })

  test('a stored licence is checked again: kept when it holds, dropped when not', async () => {
    const good = await sign(payload())
    const kept = await world({ licence: good, trialStartedAt: 5 })
    await start(kept.d)
    expect(kept.state.now().licence).toBe(good)

    const bad = await world({ licence: await sign(payload('other')), trialStartedAt: 5 })
    await start(bad.d)
    expect(bad.state.now().licence).toBeNull()
    expect(bad.store.has('licence')).toBe(false)

    const odd = await world({ licence: 42 })
    await start(odd.d)
    expect(odd.store.has('licence')).toBe(false)
  })
})

describe('licence key', () => {
  test('a good key unlocks and is kept; a bad one changes nothing', async () => {
    const { d, store, state } = await world()
    expect(await accept(d, 'junk')).toBe(false)
    expect(state.now().licence).toBeNull()
    const good = await sign(payload())
    expect(await accept(d, ` ${good} `)).toBe(true)
    expect(store.get('licence')).toBe(good)
    expect(state.now().licence).toBe(good)
  })
})

describe('buy', () => {
  test('opens checkout for this install, polls, and unlocks when the site answers a licence', async () => {
    const { d, w, store, state, tick, live } = await world()
    await buy(d)
    const install = store.get('install') as string
    expect(install).toMatch(/^[0-9a-f-]{36}$/)
    expect(w.opened).toEqual([LINK + install])
    expect(state.now().isWaiting).toBe(true)
    expect(state.now().note).toBe('Finish checkout in your browser: Workspaces unlocks on its own.')

    await tick()
    expect(w.fetched).toEqual([SITE_URL + install])
    expect(state.now().isWaiting).toBe(true)

    const good = await sign(payload())
    w.answer = () => Promise.resolve({ ok: true, text: JSON.stringify({ paid: true, licence: good }) })
    await tick()
    expect(state.now()).toMatchObject({ licence: good, isWaiting: false, note: null })
    expect(store.get('licence')).toBe(good)
    expect(w.toasts).toEqual(['Workspaces unlocked. Thank you!'])
    expect(live()).toBe(0)

    await buy(d) // a second purchase keeps the install id
    expect(w.opened[1]).toBe(LINK + install)
  })

  test('copies the link when the browser does not open; says it when that fails too', async () => {
    const { d, w } = await world()
    w.opens = false
    await buy(d)
    expect(w.copied).toEqual([w.opened[0]])
    expect(w.toasts).toEqual(['The checkout link is copied: paste it into your browser.'])
    w.copies = false
    await buy(d)
    expect(w.toasts[1]).toBe(`Open this link to buy: ${w.opened[1]}`)
  })

  test('a failed ask, an error, junk, or an unpaid answer keeps waiting', async () => {
    const { d, w, state, tick } = await world()
    await buy(d)
    for (const answer of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ ok: false, text: '' }),
      () => Promise.resolve({ ok: true, text: 'not json' }),
      () => Promise.resolve({ ok: true, text: '"text"' }),
      () => Promise.resolve({ ok: true, text: '{"paid":true}' }),
    ]) {
      w.answer = answer
      await tick()
    }
    expect(w.fetched).toHaveLength(5)
    expect(state.now().isWaiting).toBe(true)
  })

  test('a licence from the site that does not check out says so', async () => {
    const { d, w, state, tick, live } = await world()
    await buy(d)
    w.answer = () => Promise.resolve({ ok: true, text: JSON.stringify({ paid: true, licence: 'forged.licence' }) })
    await tick()
    expect(state.now()).toMatchObject({ licence: null, isWaiting: false })
    expect(state.now().note).toBe('The licence the site sent did not check out. Press Unlock to try again.')
    expect(live()).toBe(0)
  })

  test('gives up after 10 minutes', async () => {
    const { d, w, state, tick, live } = await world()
    await buy(d)
    w.now += WAIT_MS - POLL_MS
    await tick()
    expect(state.now()).toMatchObject({ isWaiting: false, note: 'No purchase seen in 10 minutes. Press Unlock to try again.' })
    expect(live()).toBe(0)
  })

  test('cancel stops waiting, and an answer already on its way is dropped', async () => {
    const { d, w, state, tick, live } = await world()
    await buy(d)
    const good = await sign(payload())
    let release!: () => void
    w.answer = () =>
      new Promise(resolve => {
        release = () => resolve({ ok: true, text: JSON.stringify({ paid: true, licence: good }) })
      })
    const asking = tick()
    while (w.fetched.length === 0) await Promise.resolve()
    await cancel(d)
    expect(state.now()).toMatchObject({ isWaiting: false, note: null })
    expect(live()).toBe(0)
    release()
    await asking
    expect(state.now().licence).toBeNull()
  })

  test('a poll that fails is logged, not thrown', async () => {
    const { d, w, tick } = await world()
    await buy(d)
    d.state.set = () => Promise.reject(new Error('state gone'))
    w.now += WAIT_MS
    await tick()
    expect(w.logs).toEqual(['workspaces licence: Error: state gone'])
  })
})
