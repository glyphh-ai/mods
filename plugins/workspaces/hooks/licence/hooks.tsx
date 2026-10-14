// The licence, wired to the engine: the one file of this module that holds
// `$` and the licence's state (the engine follows `$` and atoms only within
// the file whose hook received them). It adds, to the mod's command and
// pane (both named MOD): `/<MOD> key <licence>`, and the trial line, the
// locked page or the licensed line around the pane. Commands the trial gates
// check `refusal()` from ./access themselves, reading this same state.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { INITIAL, access, trialText } from './access.ts'
import { MOD, PRODUCT } from './config.ts'
import { accept, buy, cancel, start, type Deps } from './flow.ts'
import { verify } from './verify.ts'
import { LicensedBar, Locked, TrialBar, type LicenceActions } from './view.tsx'

// The engine reads a state reference's plugin and key, and a hook's matcher,
// as literals, so the mod's name ('workspaces', MOD in ./config) is written
// out here too. Copied into another mod, change each.
const licence = atom({ plugin: 'workspaces', key: 'licence' } as const, INITIAL)

function deps($: EngineInterface): Deps {
  return {
    store: {
      get: key => $.store.get(key),
      set: (key, value) => $.store.set(key, value),
      delete: key => $.store.delete(key),
    },
    state: { get: () => read($, licence), set: async fn => void (await update($, licence, fn)) },
    now: () => $.clock.now(),
    every: (ms, fn) => $.clock.every(ms, () => void fn()),
    check: async text => (await verify(text, MOD)) !== null,
    fetch: url => $.http.fetch(url),
    open: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    copy: async text => (await $.ui.copy({ text })).isCopied,
    toast: text => $.ui.toast(text),
    log: text => $.ui.log(text),
  }
}

export function licensing(on: On) {
  // Two values that between them match every session: a plugin has one
  // session.start hook without a matcher, and that one is the mod's own.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    await start(deps($))
    return next(e)
  })

  on('command.run', { command: 'workspaces' }, async ($, e, next) => {
    const words = e.args.trim().split(/\s+/)
    if (words[0] !== 'key') return next(e)
    if (words.length !== 2) return { text: `Usage: /${MOD} key <licence>` }
    const ok = await accept(deps($), words[1]!)
    return { text: ok ? `${PRODUCT} unlocked.` : 'That licence key did not check out.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'workspaces' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const ui = { Box, Text, Button }
    const state = await read($, licence)
    const now = await access(state, await $.clock.now())
    const d = deps($)
    const act: LicenceActions = {
      buy: () => void buy(d).catch(err => $.ui.toast(`Checkout did not open: ${String(err)}`)),
      cancel: () => void cancel(d),
      copy: () =>
        void $.ui
          .copy({ text: state.licence ?? '', surface: e.surface })
          .then(r => $.ui.toast(r.isCopied ? 'Licence key copied.' : 'The licence key could not be copied here.')),
    }
    if (now.kind === 'expired') return Locked(ui, state, act)
    const inner = await next(e)
    return (
      <Box flexDirection="column" gap={1}>
        {now.kind === 'trial' && TrialBar(ui, trialText(now.daysLeft), state, act)}
        {inner}
        {now.kind === 'licensed' && LicensedBar(ui, act)}
      </Box>
    )
  })
}
