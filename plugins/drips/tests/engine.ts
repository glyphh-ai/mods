// The world beneath the mod at the engine's level: HOME, Node, the desktop
// app's Browser pane, the Drips page's helper, swiftc and the fullscreen
// overlay's processes, all in memory.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { done, mcpText } from './fakes.ts'
import { accountProcess, fakeServer, seedAccount, SERVER, type Account } from './glyphh.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')
export const HOME = '/home/t'

export type WorldOptions = {
  surfaces?: string[]
  noNode?: boolean
  /** No Xcode Command Line Tools: swiftc is not there. */
  noSwift?: boolean
  /** The app refuses the mod's own calls to its Browser pane. */
  browserRefuses?: boolean
  /** The page, once opened, never connects. */
  pageNeverOpens?: boolean
  /** The Glyphh account when the session starts: Pro unless a test says. */
  account?: Account
}

/** One fullscreen overlay process: its request, and whether it was told to end. */
export type FakeOverlay = { pid: number; request: { html: string; screen: unknown; closeAfterMs: number }; ended: boolean; end(why: string): void }

export function world(on: On, options: WorldOptions = {}) {
  const ran: string[][] = []
  const mcp: string[] = []
  /** The pages asked of the Browser pane, by URL. */
  const browsed: string[] = []
  const copied: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const commands: string[] = []
  const tools: string[] = []
  const files = new Set<string>()
  const overlays: FakeOverlay[] = []
  // ~/.glyphh: the account's files, shared by every Glyphh mod.
  const glyphh = new Map<string, string>()
  const account = options.account ?? 'pro'
  seedAccount(glyphh, account, T0)
  const server = fakeServer(account)
  const writes: { argv: string[]; stdin: string }[] = []
  const page = {
    alive: null as { port: string; token: string; version: string } | null,
    open: 0,
    starts: 0,
    played: [] as { kind: string; effect: string; html: string; closeAfterMs: number }[],
    closed: [] as string[],
    stops: 0,
    library: [] as { drips: { name: string; recipe: string }[]; effects: string[]; display: string }[],
    licence: [] as Record<string, unknown>[],
    inbox: [] as object[],
    /** The page's asks of the account (Sign in, Cancel, Upgrade, Manage billing). */
    licenceAsks: [] as string[],
    /** The page asking the mod for something. */
    say: (msg: object) => void page.inbox.push(msg),
  }
  let nextPid = 100

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.read', (_$, e) => {
    if (e.path.startsWith(`${HOME}/.glyphh/`)) {
      const text = glyphh.get(e.path)
      if (text === undefined) throw new Error(`ENOENT ${e.path}`)
      return { value: text }
    }
    if (e.path.endsWith('/.claude-plugin/plugin.json')) return { value: '{"name":"drips","version":"1.2.3"}' }
    return { value: e.path.endsWith('overlay.swift') ? 'import AppKit' : `code of ${e.path}` }
  })
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('session.surfaces', () => ({ value: (options.surfaces ?? ['desktop']) as never }))
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__drips__${e.name}` } as never }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const mine = accountProcess(argv, e.init?.stdin, glyphh, writes)
    if (mine) return { value: mine }
    const [cmd] = argv
    if (argv[1] === '--version') return { value: options.noNode ? done('', 127) : done('v22.1.0\n') }
    if (cmd === '/bin/zsh') return { value: done('', 1) }
    if (cmd === 'uname') return { value: done('Darwin\n') }
    if (cmd === 'xcode-select') return { value: options.noSwift ? done('', 2, 'no developer tools') : done('/Library/Developer/CommandLineTools\n') }
    if (cmd === 'xcrun') return { value: done('/usr/bin/swiftc\n') }
    if (cmd === '/usr/bin/swiftc' || cmd === '/bin/mkdir' || cmd === 'open') return { value: done() }
    if (cmd === '/bin/mv') {
      files.add(argv[3]!)
      return { value: done() }
    }
    if (cmd === '/bin/kill') {
      overlays.find(o => String(o.pid) === argv[2])?.end('term')
      return { value: done() }
    }
    if (argv[1] === 'screen') return { value: done('{"x":0,"y":0,"w":1440,"h":900}\n') }
    return { value: done('', 1, `unknown ${cmd}`) }
  })
  on('process.spawn', async function* (_$, e) {
    const argv = [...e.argv]
    if (argv[1]?.endsWith('server.mjs')) {
      page.starts++
      const env = e.env ?? {}
      page.alive = { port: env.DRIPS_PORT!, token: env.DRIPS_TOKEN!, version: env.DRIPS_VERSION! }
      return { value: { code: 0, signal: null } }
    }
    // The fullscreen overlay: on screen, then closed when it ends.
    let end: (why: string) => void = () => {}
    const ended = new Promise<string>(r => (end = r))
    const o: FakeOverlay = { pid: nextPid++, request: JSON.parse(e.input ?? '{}'), ended: false, end: why => ((o.ended = true), end(why)) }
    overlays.push(o)
    yield { stream: 'stdout' as const, text: `{"t":"shown","pid":${o.pid}}\n` }
    const why = await ended
    yield { stream: 'stdout' as const, text: `{"t":"closed","why":"${why}"}\n` }
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', (_$, e) => {
    if (e.url.startsWith(`${SERVER}/`)) return { value: server.handle(e.url, e.init) }
    const url = new URL(e.url)
    const ok = (body: unknown) => ({ value: { ok: true, status: 200, headers: {}, text: JSON.stringify(body) } })
    const alive = page.alive
    if (!alive || url.port !== alive.port) throw new Error('connection refused')
    if (e.init?.headers?.['X-Token'] !== alive.token) return { value: { ok: false, status: 403, headers: {}, text: 'forbidden' } }
    const body = e.init?.body ? JSON.parse(String(e.init.body)) : undefined
    switch (url.pathname) {
      case '/api/state':
        return ok({ version: alive.version, open: page.open, viewport: page.open ? { w: 1000, h: 700 } : null })
      case '/api/key':
        return ok({ key: 'once' })
      case '/api/inbox':
        return ok({ messages: page.inbox.splice(0) })
      case '/api/library':
        page.library.push(body)
        return ok({})
      case '/api/play':
        page.played.push(body)
        return ok({})
      case '/api/close':
        page.closed.push(body.effect)
        return ok({})
      case '/api/stop':
        page.stops++
        return ok({})
      case '/api/licence-inbox':
        return ok({ actions: page.licenceAsks.splice(0) })
      case '/api/licence-state':
        page.licence.push(body.status)
        return ok({})
      case '/api/quit':
        page.alive = null
        return ok({})
    }
    return { value: { ok: false, status: 404, headers: {}, text: '' } }
  })
  on('mcp.call', (_$, e) => {
    mcp.push(`${e.server}.${e.tool}`)
    if (e.tool === 'preview_start') browsed.push(String(e.args.url))
    if (options.browserRefuses && e.server === 'Claude_Browser') return { value: mcpText('Not allowed in auto mode', true) }
    if (e.tool === 'preview_start') {
      if (!options.pageNeverOpens) page.open = 1
      return { value: mcpText('{"tabId": "t1"}') }
    }
    return { value: mcpText('ok') }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.submit', (_$, e) => {
    asked.push(e.text)
    return { text: e.text }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ok' } as never }))
  return { ran, mcp, browsed, copied, toasts, asked, commands, tools, files, overlays, page, glyphh, server, writes }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}

export async function callTool($: Engine, tool: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return ((await $.tool.call({ tool, input } as never)) as { result?: unknown }).result
}

export const endTurn = ($: Engine, durationMs: number, extra: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'done', durationMs, isAborted: false, turnId: 't-1', reason: 'answer', ...extra } as never)
