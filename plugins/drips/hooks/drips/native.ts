// Effects in the native overlay (native/overlay.swift): over Claude's window
// (the window Claude is running in, followed as it moves) or over the whole
// screen. The overlay is compiled with swiftc the first time it is needed and
// kept in ~/Library/Caches/glyphh-drips, one binary per version of its
// source. Each effect is one overlay process; a persistent one is ended with
// SIGTERM. Works on NativeDeps, closures over `$` that ./hooks.tsx hands it.
import { loopDoc, oneShotDoc, type Doc } from './docs.ts'
import type { Closer, Host } from './manager.ts'
import {
  binaryPath,
  compileArgv,
  digestOf,
  lineSplitter,
  parseAncestors,
  parseEvent,
  parseLocated,
  parseScreen,
  playRequest,
  windowRequest,
  type Layer,
  type OverlayEvent,
  type Screen,
} from './overlay.ts'
import type { Ancestor, Target } from './target.ts'

export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type RunOptions = { timeoutMs?: number; stdin?: string }

export type NativeDeps = {
  /** A command's result, or null when it could not start. */
  run(argv: readonly string[], opts?: RunOptions): Promise<RunResult | null>
  /** Starts `argv` with `input` on stdin: the overlay's events, in order, until it exits. */
  spawn(argv: readonly string[], input: string): AsyncIterable<OverlayEvent>
  read(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  home(): Promise<string | undefined>
  /** The mod's folder. */
  root: string
}

export const SWIFT_MISSING = "Drips' overlay needs Swift: install the Xcode Command Line Tools (xcode-select --install)."
export const MAC_ONLY = "Drips' overlay needs macOS."
const BUILD_MS = 5 * 60_000
const ASK_MS = 10_000

export type Prepared = { binary: string } | { missing: string }

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 160) ?? ''

/** The overlay's events from a spawned child's output pieces. */
export async function* eventsOf(chunks: AsyncIterable<{ stream: string; text: string }>): AsyncGenerator<OverlayEvent> {
  const split = lineSplitter()
  for await (const chunk of chunks) {
    if (chunk.stream !== 'stdout') continue
    for (const line of split(chunk.text)) {
      const ev = parseEvent(line)
      if (ev) yield ev
    }
  }
}

/** The overlay binary for this copy of the mod: the one built before, or built now. */
export async function prepareOverlay(d: NativeDeps): Promise<Prepared> {
  if ((await d.run(['uname', '-s']))?.stdout.trim() !== 'Darwin') return { missing: MAC_ONLY }
  const home = await d.home()
  if (!home) return { missing: "Drips' overlay needs HOME to be set." }
  const source = `${d.root}/native/overlay.swift`
  const binary = binaryPath(home, await digestOf(await d.read(source)))
  if (await d.exists(binary)) return { binary }
  if ((await d.run(['xcode-select', '-p']))?.exitCode !== 0) return { missing: SWIFT_MISSING }
  const found = await d.run(['xcrun', '--find', 'swiftc'])
  const swiftc = found?.exitCode === 0 ? found.stdout.trim() : ''
  if (!swiftc) return { missing: SWIFT_MISSING }
  await d.run(['/bin/mkdir', '-p', binary.slice(0, binary.lastIndexOf('/'))])
  const building = `${binary}.building`
  const built = await d.run(compileArgv(swiftc, source, building), { timeoutMs: BUILD_MS })
  if (built?.exitCode !== 0) return { missing: `Drips' overlay did not build: ${firstLine(built?.stderr ?? 'swiftc did not run')}` }
  const moved = await d.run(['/bin/mv', '-f', building, binary])
  if (moved?.exitCode !== 0) return { missing: `Drips' overlay could not be kept: ${firstLine(moved?.stderr ?? '')}` }
  return { binary }
}

/** The apps among the overlay's ancestors: the ones hosting this session. */
export async function ancestorsOf(d: NativeDeps, binary: string): Promise<Ancestor[]> {
  const r = await d.run([binary, 'apps'], { timeoutMs: ASK_MS })
  return r?.exitCode === 0 ? parseAncestors(r.stdout) : []
}

/** Where an overlay goes: over the whole screen, or over the window `target`
 *  names (`missed` is told when there is no such window, and the effect plays
 *  over the screen under the pointer instead). */
export type Placement = { kind: 'fullscreen' } | { kind: 'window'; target(): Promise<Target | null>; missed(): void }

type Spot = { frame: Screen; layer: Layer; follow: number | null }
type Shown = { pid: number; closed: Promise<void> }

export function nativeHost(d: NativeDeps, binary: string, place: Placement): Host {
  async function screen(): Promise<Screen> {
    const r = await d.run([binary, 'screen'], { timeoutMs: ASK_MS })
    const s = r?.exitCode === 0 ? parseScreen(r.stdout) : null
    if (!s) throw new Error("Drips' overlay could not find the screen.")
    return s
  }

  async function spot(): Promise<Spot> {
    if (place.kind === 'fullscreen') return { frame: await screen(), layer: 'screen', follow: null }
    const target = await place.target()
    if (target) {
      const r = await d.run([binary, 'window'], { timeoutMs: ASK_MS, stdin: windowRequest(target) })
      const located = r?.exitCode === 0 ? parseLocated(r.stdout) : null
      if (located?.found) return { frame: located.frame, layer: 'window', follow: located.id }
      if (located) {
        place.missed()
        return { frame: located.frame, layer: 'window', follow: null }
      }
    }
    place.missed()
    return { frame: await screen(), layer: 'window', follow: null }
  }

  /** Opens one overlay; resolves once it is on screen. */
  async function show(doc: (s: Screen) => Doc): Promise<Shown> {
    const s = await spot()
    const { html, closeAfterMs } = doc(s.frame)
    const events = d.spawn([binary, 'play'], playRequest(html, s.frame, closeAfterMs, s.layer, s.follow))[Symbol.asyncIterator]()
    const first = await events.next()
    if (first.done || first.value.t !== 'shown') {
      const said = !first.done && first.value.t === 'error' ? `: ${first.value.message}` : ''
      throw new Error(`Drips' overlay did not open${said}`)
    }
    const closed = (async () => {
      while (!(await events.next()).done); // read to the end: the child has exited
    })()
    return { pid: first.value.pid, closed }
  }

  return {
    async oneShot(effect, opacity) {
      const shown = await show(s => oneShotDoc(effect, s.w, s.h, opacity))
      void shown.closed.catch(() => undefined)
    },
    async persistent(effect, opacity, maxMs, onClosed): Promise<Closer> {
      const shown = await show(s => loopDoc(effect, s.w, s.h, opacity, maxMs))
      let isClosed = false
      const ended = () => {
        isClosed = true
        onClosed()
      }
      void shown.closed.then(ended, ended)
      return {
        close: async () => {
          if (!isClosed) await d.run(['/bin/kill', '-TERM', String(shown.pid)])
        },
      }
    },
  }
}
