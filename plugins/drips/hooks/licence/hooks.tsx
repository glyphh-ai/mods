// Copied from shared/licence/hooks.tsx by scripts/sync-shared.mjs: edit it there.
// The account, wired to the engine: the one file of this module that holds
// `$` and the account's state (the engine follows `$` and atoms only within
// the file whose hook received them). It adds `/<MOD> signin` and
// `/<MOD> signout` to the mod's command, and shows the account in the mod's
// page: every second it sends the page's helper the account's state in words
// (pageStatus, never the token) when that changed, and takes what the page
// asked (Sign in, Cancel, Upgrade, Manage billing). Commands the plan limits
// check `refusal()` from ./access themselves, reading this same state.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { HelperInfo } from '../../types'
import { INITIAL, pageAction, pageStatus, type PageAction } from './access.ts'
import { MOD } from './config.ts'
import { billing, cancel, isLimit, signIn, signOut, start, upgrade, type Deps, type Machine } from './flow.ts'

// The engine reads a state reference's plugin and key, and a hook's matcher,
// as literals, so the mod's name ('drips', MOD in ./config) is written
// out here too: scripts/sync-shared.mjs writes it in from MOD.
const account = atom({ plugin: 'drips', key: 'account' } as const, INITIAL)
/** Where the mod's page helper listens (the mod keeps it; read here only). */
const helperInfo = atom({ plugin: 'drips', key: 'helper' } as const, null as HelperInfo | null)

/** What the page was last sent, and the timer that keeps it current. */
let sent = ''
let syncing: Timer | null = null

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')

/** This Mac as the sign-in names it: a hash of its hardware UUID (never the
 *  UUID itself), its name, the surface and this mod's version. */
async function machine($: EngineInterface): Promise<Machine> {
  const run = (argv: string[]) => $.process.run(argv).then(r => (r.exitCode === 0 ? r.stdout : ''), () => '')
  const uuid = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(await run(['/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice']))?.[1]
  const machine_id = uuid ? hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uuid))) : undefined
  const name = ((await run(['/usr/sbin/scutil', '--get', 'ComputerName'])).trim() || 'Mac').slice(0, 80)
  const surface = (await $.session.surfaces()).includes('desktop') ? 'desktop' : 'cli'
  let mod_version = '0.0.0'
  try {
    const v = (JSON.parse(String(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))) as { version?: unknown }).version
    if (typeof v === 'string' && v) mod_version = v.slice(0, 40)
  } catch {
    // the version stays unknown
  }
  return { ...(machine_id ? { machine_id } : {}), name, surface, mod_version }
}

function deps($: EngineInterface): Deps {
  return {
    home: () => $.env.get('HOME'),
    read: path => $.fs.read(path).then(String, () => null),
    // umask 077: the file and its temporary name are the owner's alone from
    // the first byte; the text goes on stdin, never in an argument.
    writePrivate: async (path, text) => {
      const dir = path.slice(0, path.lastIndexOf('/'))
      const script = 'umask 077 && mkdir -p "$1" && t="$2.$$.tmp" && rm -f "$t" && cat > "$t" && mv -f "$t" "$2"'
      const r = await $.process.run(['/bin/sh', '-c', script, 'sh', dir, path], { stdin: text })
      if (r.exitCode !== 0) throw new Error(`could not write ${path}`)
    },
    remove: async path => void (await $.process.run(['/bin/rm', '-f', path]).catch(() => null)),
    fetch: (url, init) => $.http.fetch(url, init),
    state: { get: () => read($, account), set: async fn => void (await update($, account, fn)) },
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, () => void fn()),
    every: (ms, fn) => $.clock.every(ms, () => void fn()),
    machine: () => machine($),
    isDesktop: async () => (await $.session.surfaces()).includes('desktop'),
    // The way Workspaces opens its layout page: a tab of the app's Browser pane.
    browse: url => $.mcp.call('Claude_Browser', 'preview_start', { url }).then(r => !r.isError, () => false),
    // A prompt submitted from inside a command would wait on the command
    // itself: it goes once the command has returned.
    ask: text =>
      void $.clock.after(0, () => {
        $.prompt.submit({ text }).catch(() => $.ui.toast('The Browser pane is not available: allow mcp__Claude_Browser__preview_start'))
      }),
    open: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    copy: async text => (await $.ui.copy({ text })).isCopied,
    toast: text => $.ui.toast(text),
    log: text => $.ui.log(text),
  }
}

/** One request to the page's helper, with its token. */
async function ask($: EngineInterface, info: HelperInfo, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Token': info.token, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`the page's helper answered ${path} with an error`)
  return JSON.parse(res.text) as Record<string, unknown>
}

/** What the page asked of the account. */
async function act($: EngineInterface, action: PageAction): Promise<void> {
  const d = deps($)
  if (action === 'signin') await signIn(d)
  else if (action === 'cancel') await cancel(d)
  else if (action === 'billing') await billing(d)
  else {
    const limit = action.slice('upgrade:'.length)
    await upgrade(d, action !== 'upgrade' && isLimit(limit) ? limit : undefined)
  }
}

/** The page's helper and the account in step: its asks taken, its state sent when changed. */
async function sync($: EngineInterface): Promise<void> {
  const info = await read($, helperInfo)
  if (!info) {
    sent = ''
    return
  }
  const asked = ((await ask($, info, '/api/licence-inbox')).actions as unknown[] | undefined) ?? []
  for (const a of asked) {
    const action = pageAction(a)
    if (action) await act($, action)
  }
  const status = JSON.stringify(pageStatus(await read($, account), await $.clock.now()))
  if (status === sent) return
  await ask($, info, '/api/licence-state', { status: JSON.parse(status) })
  sent = status
}

export function licensing(on: On) {
  // Two values that between them match every session: a plugin has one
  // session.start hook without a matcher, and that one is the mod's own.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    await start(deps($))
    sent = ''
    syncing?.cancel()
    syncing = $.clock.every(1000, () => {
      sync($).catch(() => {
        sent = '' // the helper went away: a new one is sent everything
      })
    })
    return next(e)
  })

  on('command.run', { command: 'drips' }, async ($, e, next) => {
    const words = e.args.trim().split(/\s+/)
    if (words[0] !== 'signin' && words[0] !== 'signout') return next(e)
    if (words.length !== 1) return { text: `Usage: /${MOD} ${words[0]}` }
    return { text: words[0] === 'signin' ? await signIn(deps($)) : await signOut(deps($)) }
  })
}
