// The world beneath the mod at the engine's level: HOME, swiftc, the native
// overlay's processes (and the windows it finds), the server that answers
// whether checkout went through, all in memory.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { SERVER } from '../hooks/unlock/server.ts'
import { done } from './fakes.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')
export const HOME = '/home/t'

export type WorldOptions = {
  surfaces?: string[]
  /** No Xcode Command Line Tools: swiftc is not there. */
  noSwift?: boolean
  /** Not macOS. */
  notMac?: boolean
  /** What the server answers GET /v1/unlock/license; not paid unless a test says. */
  site?: (url: string) => { paid: boolean; licence?: string }
  /** The target app has no window on screen. */
  noWindow?: boolean
}

export const CLAUDE_WINDOW = { id: 79026, frame: { x: 799, y: 298, w: 1325, h: 1138 } }
export const SCREEN = { x: 0, y: 0, w: 1440, h: 900 }
export const CLAUDE_APP = { pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true }

/** One overlay process: its request, the scores it posts, and its end. */
export type FakeOverlay = {
  pid: number
  request: { v: number; html: string; frame: unknown; closeAfterMs: number; layer: string; follow: number | null; interactive: boolean }
  ended: boolean
  /** Posts a game's score: printed as a score event before it closes. */
  score(n: number): void
  end(why: string): void
}

export function world(on: On, options: WorldOptions = {}) {
  const ran: string[][] = []
  const toasts: string[] = []
  const copied: string[] = []
  const commands: string[] = []
  const files = new Set<string>()
  const overlays: FakeOverlay[] = []
  const siteAsks: string[] = []
  let nextPid = 100

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.read', (_$, e) => ({ value: e.path.endsWith('overlay.swift') ? 'import AppKit' : `code of ${e.path}` }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('session.surfaces', () => ({ value: (options.surfaces ?? ['desktop']) as never }))
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const [cmd] = argv
    if (cmd === 'uname') return { value: done(options.notMac ? 'Linux\n' : 'Darwin\n') }
    if (cmd === 'xcode-select') return { value: options.noSwift ? done('', 2, 'no developer tools') : done('/Library/Developer/CommandLineTools\n') }
    if (cmd === 'xcrun' && argv[1] === '--find') return { value: done('/usr/bin/swiftc\n') }
    if (cmd === 'xcrun' || cmd === '/bin/mkdir' || cmd === 'open') return { value: done() }
    if (cmd === '/bin/mv') {
      files.add(argv[3]!)
      return { value: done() }
    }
    if (argv[1] === 'screen') return { value: done(`${JSON.stringify(SCREEN)}\n`) }
    if (argv[1] === 'apps') return { value: done(`${JSON.stringify({ ancestors: [CLAUDE_APP] })}\n`) }
    if (argv[1] === 'window') {
      const found = options.noWindow ? { found: false, ...SCREEN } : { found: true, id: CLAUDE_WINDOW.id, ...CLAUDE_WINDOW.frame }
      return { value: done(`${JSON.stringify(found)}\n`) }
    }
    return { value: done('', 1, `unknown ${cmd}`) }
  })
  on('process.spawn', async function* (_$, e) {
    let end: (why: string) => void = () => {}
    const ended = new Promise<string>(r => (end = r))
    const scores: number[] = []
    const o: FakeOverlay = {
      pid: nextPid++,
      request: JSON.parse(e.input ?? '{}'),
      ended: false,
      score: n => void scores.push(n),
      end: why => ((o.ended = true), end(why)),
    }
    overlays.push(o)
    yield { stream: 'stdout' as const, text: `{"t":"shown","pid":${o.pid}}\n` }
    const why = await ended
    for (const n of scores) yield { stream: 'stdout' as const, text: `{"t":"score","score":${n}}\n` }
    yield { stream: 'stdout' as const, text: `{"t":"closed","why":"${why}"}\n` }
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', (_$, e) => {
    if (!e.url.startsWith(`${SERVER}/v1/unlock/license`)) throw new Error('connection refused')
    siteAsks.push(e.url)
    const answer = options.site?.(e.url) ?? { paid: false }
    return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify(answer) } }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return { ran, toasts, copied, commands, files, overlays, siteAsks }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}
