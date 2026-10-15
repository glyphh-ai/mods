// The account module's Deps in memory: ~/.glyphh, a clock whose timers run
// when the test moves it, the browser, and the Glyphh server (./glyphh).
import type { Timer } from 'claude-code'

import type { AccountState } from '../types'
import { INITIAL } from '../hooks/licence/access.ts'
import type { Deps } from '../hooks/licence/flow.ts'
import { fakeServer, seedAccount, type Account } from './glyphh.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')

type Pending = { at: number; every: number | null; fn: () => Promise<void>; cancelled: boolean }

export function fakeDeps(account: Account = 'pro', options: { home?: string | null; fetchedAt?: number } = {}) {
  const files = new Map<string, string>()
  seedAccount(files, account, options.fetchedAt ?? T0)
  const server = fakeServer(account)
  let state: AccountState = INITIAL
  let now = T0
  const timers: Pending[] = []
  const w = {
    files,
    server,
    opened: [] as string[],
    copied: [] as string[],
    toasts: [] as string[],
    logs: [] as string[],
    writes: [] as string[],
    openOk: true,
    copyOk: true,
    writeFails: false,
    state: () => state,
    now: () => now,
    /** Timers waiting. */
    pending: () => timers.filter(t => !t.cancelled).length,
    /** Moves the clock, running each timer that comes due, in turn. */
    async advance(ms: number) {
      const end = now + ms
      for (;;) {
        const due = timers.filter(t => !t.cancelled && t.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = Math.max(now, due.at)
        if (due.every === null) due.cancelled = true
        else due.at += due.every
        await due.fn()
      }
      now = end
    },
  }
  const timer = (ms: number, every: boolean, fn: () => Promise<void>): Timer => {
    const t: Pending = { at: now + ms, every: every ? ms : null, fn, cancelled: false }
    timers.push(t)
    return { cancel: () => void (t.cancelled = true) } as Timer
  }
  const home = options.home === undefined ? '/home/t' : options.home
  const d: Deps = {
    home: async () => home ?? undefined,
    read: async p => files.get(p) ?? null,
    writePrivate: async (p, text) => {
      if (w.writeFails) throw new Error(`could not write ${p}`)
      w.writes.push(p)
      files.set(p, text)
    },
    remove: async p => void files.delete(p),
    fetch: async (url, init) => server.handle(url, init),
    state: {
      get: async () => state,
      set: async fn => {
        state = fn(state)
      },
    },
    now: async () => now,
    after: (ms, fn) => timer(ms, false, fn),
    every: (ms, fn) => timer(ms, true, fn),
    machine: async () => ({ machine_id: 'a'.repeat(64), name: 'Test Mac', surface: 'desktop', mod_version: '1.0.0' }),
    open: async url => {
      w.opened.push(url)
      return w.openOk
    },
    copy: async text => {
      w.copied.push(text)
      return w.copyOk
    },
    toast: text => void w.toasts.push(text),
    log: text => void w.logs.push(text),
  }
  return { d, ...w, w }
}
