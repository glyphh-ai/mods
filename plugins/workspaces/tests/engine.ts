// The world beneath the mod at the engine's level: HOME and ~/.glyphh in
// memory, the desktop app's View menu and browser, the session's surfaces.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { done, mcpText } from './fakes.ts'

export const T0 = Date.parse('2026-10-14T09:00:00Z')

export const PANE = {
  plugin: 'workspaces',
  component: 'Pane' as const,
  requestId: 'workspaces',
  props: {
    title: 'Workspaces',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
  viewport: { columns: 100, rows: 42 },
}

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
}

export function world(on: On, options: WorldOptions = {}) {
  const home = options.home === undefined ? '/home/t' : options.home
  const files = new Map<string, string>(Object.entries(options.seed ?? {}))
  const open = new Set<string>()
  const ran: string[][] = []
  const mcp: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const commands: string[] = []
  const w = { openExit: 0, isPlaced: true, find: '', copied: [] as string[], closed: [] as string[], opened: [] as string[] }

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' && home !== null ? home : undefined }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(p => p.startsWith(`${e.path}/`))
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
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    if (argv[0] === 'open') return { value: done('', w.openExit) }
    if (argv[0] === '/bin/rm') {
      if (options.rmFails) return { value: done('', 1, 'Operation not permitted') }
      files.delete(argv[2]!)
      return { value: done() }
    }
    if (argv[0] === 'find') return { value: done(w.find) }
    const script = argv[2] ?? ''
    if (options.menuFails) return { value: done('', 1, 'no access') }
    if (script.includes('get name of every menu item')) {
      return { value: done((['Files', 'Changes', 'Terminal', 'Browser'] as const).map(l => `${open.has(l) ? 'Hide' : 'Show'} ${l}`).join(', ')) }
    }
    const m = /click menu item "(Show|Hide) (\w+)"/.exec(script)!
    if (m[1] === 'Show') open.add(m[2]!)
    else open.delete(m[2]!)
    return { value: done() }
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
  on('ui.open', (_$, e) => {
    w.opened.push(e.id)
    return { value: w.isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }
  })
  on('ui.close', (_$, e) => {
    w.closed.push(e.id)
    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => {
    if (options.promptFails) throw new Error('no prompt')
    asked.push(e.text)
    return { text: e.text }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  for (const [command, text] of Object.entries(options.taken ?? {})) on('command.run', { command }, () => ({ text }))
  return { files, open, ran, mcp, toasts, asked, commands, w }
}

/** The session starting on the desktop, as the engine starts it. */
export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

/** A slash command typed: its answer's text. */
export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}
