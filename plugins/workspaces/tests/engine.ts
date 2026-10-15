// The world beneath the mod at the engine's level: HOME and ~/.glyphh in
// memory, Chrome and Node found, the desktop app's View menu and browser,
// the session's surfaces, and the layout page's helper.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { PageSettings } from '../types'
import { done, mcpText } from './fakes.ts'
import { accountProcess, fakeServer, seedAccount, SERVER, type Account } from './glyphh.ts'

export const T0 = Date.parse('2026-10-14T09:00:00Z')
export const DIR = '/home/t/.glyphh/workspaces'
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


export type WorldOptions = {
  surfaces?: string[]
  home?: string | null
  /** Command names Claude Code already has, each answering with its own text. */
  taken?: Record<string, string>
  /** The View menu refuses (no Accessibility permission). */
  menuFails?: boolean
  /** The app refuses the mod's own calls to its Browser pane. */
  browserRefuses?: boolean
  /** Claude cannot be asked: a prompt submitted is refused. */
  promptFails?: boolean
  /** Removing a file fails. */
  rmFails?: boolean
  /** Files on disk before the session starts. */
  seed?: Record<string, string>
  /** Google Chrome or Node is not installed. */
  noChrome?: boolean
  noNode?: boolean
  /** The helper never comes up. */
  helperFails?: boolean
  /** The Glyphh account when the session starts: Pro unless a test says. */
  account?: Account
}

/** The layout page's helper as the mod sees it: what it was sent, and a way to make it speak. */
export type FakeHelper = {
  started: string[][]
  layouts: { layouts: { name: string; cells: { page?: string }[] }[]; active: string; library: { workspaces: { slug: string }[]; favorites: unknown[]; choices: { models: string[]; efforts: string[] } }; settings: PageSettings }[]
  /** The editor views the page was asked to show. */
  shown: string[]
  /** The environment the helper was started with. */
  env: Record<string, string>[]
  /** The running helper: where it listens, its token and version; null when it is not. */
  alive: { port: string; token: string; version: string } | null
  quits: number
  /** The account states the mod sent the page, oldest first. */
  licence: Record<string, unknown>[]
  /** The page asking the account for something (Sign in, Cancel, Upgrade, Manage billing). */
  press(action: string): void
  /** Pages listening for updates: 0 until the page is open. */
  open: number
  say(line: object): void
}

export function world(on: On, options: WorldOptions = {}) {
  const home = options.home === undefined ? '/home/t' : options.home
  const files = new Map<string, string>(Object.entries(options.seed ?? {}))
  const account = options.account ?? 'pro'
  seedAccount(files, account, T0)
  const server = fakeServer(account)
  const writes: { argv: string[]; stdin: string }[] = []
  const open = new Set<string>()
  const ran: string[][] = []
  const mcp: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const commands: string[] = []
  const slash: string[] = []
  const w = {
    find: '',
    copied: [] as string[],
    openExit: 0,
  }
  const inbox: object[] = []
  const licenceAsks: string[] = []
  const helper: FakeHelper = {
    started: [],
    layouts: [],
    shown: [],
    env: [],
    alive: null,
    quits: 0,
    licence: [],
    press: action => void licenceAsks.push(action),
    open: 0,
    say: line => void inbox.push(line),
  }

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' && home !== null ? home : undefined }))
  on('fs.exists', (_$, e) => ({
    value: (e.path === CHROME && !options.noChrome) || files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)),
  }))
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(p => p.startsWith(`${e.path}/`) && !p.slice(e.path.length + 1).includes('/'))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.stat', (_$, e) => {
    if (!files.has(e.path)) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } }
  })
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.surfaces', () => ({ value: (options.surfaces ?? ['desktop']) as never }))
  on('command.register', (_$, e) => {
    if (options.taken?.[e.name] !== undefined) throw new Error(`/${e.name} is taken`)
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__workspaces__${e.name}` } as never }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const mine = accountProcess(argv, e.init?.stdin, files, writes)
    if (mine) return { value: mine }
    if (argv[1] === '--version') return { value: options.noNode ? done('', 127) : done('v22.1.0\n') }
    if (argv[0] === '/bin/zsh') return { value: done('', 1) }
    if (argv[0] === 'open') return { value: done('', w.openExit) }
    if (argv[0] === '/bin/rm') {
      if (options.rmFails) return { value: done('', 1, 'Operation not permitted') }
      files.delete(argv[2]!)
      return { value: done() }
    }
    if (argv[0] === '/bin/mv') {
      files.set(argv[3]!, files.get(argv[2]!)!)
      files.delete(argv[2]!)
      return { value: done() }
    }
    if (argv[0] === 'find') return { value: done(w.find) }
    if (options.menuFails) return { value: done('', 1, 'no access') }
    const script = argv[2] ?? ''
    if (script.includes('get name of every menu item')) {
      return { value: done((['Files', 'Changes', 'Terminal', 'Browser'] as const).map(l => `${open.has(l) ? 'Hide' : 'Show'} ${l}`).join(', ')) }
    }
    const m = /click menu item "(Show|Hide) (\w+)"/.exec(script)!
    if (m[1] === 'Show') open.add(m[2]!)
    else open.delete(m[2]!)
    return { value: done() }
  })
  on('process.spawn', async function* (_$, e) {
    helper.started.push([...e.argv])
    const env = { ...(e.env ?? {}) }
    helper.env.push(env)
    // The launcher starts the helper detached and exits at once.
    if (!options.helperFails) helper.alive = { port: env.WORKSPACES_PORT!, token: env.WORKSPACES_TOKEN!, version: env.WORKSPACES_VERSION! }
    yield* []
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', (_$, e) => {
    const url = new URL(e.url)
    const ok = (body: unknown) => ({ value: { ok: true, status: 200, headers: {}, text: JSON.stringify(body) } })
    if (e.url.startsWith(`${SERVER}/`)) return { value: server.handle(e.url, e.init) }
    const alive = helper.alive
    if (!alive || url.port !== alive.port) throw new Error('connection refused')
    if (e.init?.headers?.['X-Token'] !== alive.token) return { value: { ok: false, status: 403, headers: {}, text: 'forbidden' } }
    if (url.pathname === '/api/inbox') return ok({ messages: inbox.splice(0) })
    if (url.pathname === '/api/licence-inbox') return ok({ actions: licenceAsks.splice(0) })
    if (url.pathname === '/api/licence-state') {
      helper.licence.push(JSON.parse(String(e.init?.body)).status)
      return ok({})
    }
    if (url.pathname === '/api/quit') {
      helper.alive = null
      helper.quits++
      return ok({})
    }
    if (url.pathname === '/api/layouts') {
      helper.layouts.push(JSON.parse(String(e.init?.body)))
      return ok({})
    }
    if (url.pathname === '/api/key') return ok({ key: 'once' })
    if (url.pathname === '/api/show') {
      helper.shown.push(JSON.parse(String(e.init?.body)).view)
      return ok({})
    }
    if (url.pathname === '/api/state') return ok({ version: alive.version, open: helper.open, pages: [{ cell: 'gmail', url: 'https://mail.google.com/mail', title: 'Inbox' }] })
    if (url.pathname === '/api/text') return ok({ cell: url.searchParams.get('cell'), text: 'Inbox (3)' })
    return { value: { ok: false, status: 404, headers: {}, text: '' } }
  })
  on('mcp.call', (_$, e) => {
    mcp.push(`${e.server}.${e.tool}`)
    if (options.browserRefuses && e.server === 'Claude_Browser') return { value: mcpText('Not allowed in auto mode', true) }
    return { value: e.tool === 'preview_start' ? mcpText('{"tabId": "t1"}') : mcpText('ok') }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    w.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.submit', (_$, e) => {
    if (options.promptFails) throw new Error('no prompt')
    asked.push(e.text)
    return { text: e.text }
  })
  on('config.list', () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice', value: 'opus', options: ['default', 'sonnet', 'opus'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] as never,
  }))
  // /model and /effort as Claude Code answers them: for this session only.
  on('command.run', { command: ['model', 'effort'] }, (_$, e) => {
    slash.push(`/${e.command} ${e.args}`)
    return { text: `Set ${e.command} to ${e.args} (this session only)` }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  for (const [command, text] of Object.entries(options.taken ?? {})) on('command.run', { command }, () => ({ text }))
  const json = (slug: string) => JSON.parse(files.get(`${DIR}/${slug}.json`)!)
  return { files, open, ran, mcp, toasts, asked, commands, slash, w, helper, json, server, writes }
}

/** The session starting on the desktop, as the engine starts it. */
export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

/** A slash command typed: its answer's text. */
export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}
