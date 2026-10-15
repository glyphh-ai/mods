import { describe, expect, test } from 'claude-code/testing'

import { MAC_ONLY, SWIFT_MISSING, eventsOf, fullscreenHost, prepareOverlay, type FullscreenDeps, type RunResult } from '../hooks/drips/fullscreen.ts'
import { binaryPath, digestOf, type OverlayEvent } from '../hooks/drips/overlay.ts'
import { flush } from './fakes.ts'

const SOURCE = 'import AppKit'
const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' })
const bad = (stderr = ''): RunResult => ({ exitCode: 1, stdout: '', stderr })

/** An overlay process the test drives: its events pushed as the test says. */
function child() {
  const queue: (OverlayEvent | null)[] = []
  let wake: (() => void) | null = null
  const push = (ev: OverlayEvent | null) => {
    queue.push(ev)
    wake?.()
  }
  async function* events(): AsyncGenerator<OverlayEvent> {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(r => (wake = r))
      const ev = queue.shift()!
      if (ev === null) return
      yield ev
    }
  }
  return { push, events }
}

function world(opts: { platform?: string; built?: boolean; xcode?: boolean; swiftc?: boolean; compiles?: boolean; home?: string } = {}) {
  const ran: string[][] = []
  const spawned: { argv: readonly string[]; input: string }[] = []
  const children: ReturnType<typeof child>[] = []
  const files = new Set<string>()
  const w = { screen: '{"x":0,"y":0,"w":1000,"h":500}', screenFails: false }
  const d: FullscreenDeps = {
    run: async (argv, _timeout) => {
      ran.push([...argv])
      const [cmd] = argv
      if (cmd === 'uname') return ok(`${opts.platform ?? 'Darwin'}\n`)
      if (cmd === 'xcode-select') return opts.xcode === false ? bad('no developer tools') : ok('/Library/Developer/CommandLineTools\n')
      if (cmd === 'xcrun') return opts.swiftc === false ? bad() : ok('/usr/bin/swiftc\n')
      if (cmd === '/usr/bin/swiftc') return opts.compiles === false ? bad('error: no such module WebKit\nmore') : ok()
      if (cmd === '/bin/mkdir' || cmd === '/bin/kill') return ok()
      if (cmd === '/bin/mv') {
        files.add(argv[3]!)
        return ok()
      }
      if (argv[1] === 'screen') return w.screenFails ? bad() : ok(w.screen)
      return null
    },
    spawn: (argv, input) => {
      spawned.push({ argv, input })
      const c = child()
      children.push(c)
      return c.events()
    },
    read: async () => SOURCE,
    exists: async path => files.has(path),
    home: async () => opts.home ?? '/Users/t',
    root: '/mods/drips',
  }
  return { d, ran, spawned, children, files, w }
}

describe('preparing the overlay', () => {
  test('built once with swiftc into the cache, then found there', async () => {
    const { d, ran, files } = world()
    const bin = binaryPath('/Users/t', await digestOf(SOURCE))
    expect(await prepareOverlay(d)).toEqual({ binary: bin })
    expect(ran).toContainEqual(['/usr/bin/swiftc', '-O', '-o', `${bin}.building`, '/mods/drips/native/overlay.swift', '-framework', 'AppKit', '-framework', 'WebKit'])
    expect(ran).toContainEqual(['/bin/mkdir', '-p', '/Users/t/Library/Caches/glyphh-drips'])
    expect(files.has(bin)).toBe(true)
    ran.length = 0
    expect(await prepareOverlay(d)).toEqual({ binary: bin })
    expect(ran.some(a => a[0] === '/usr/bin/swiftc')).toBe(false)
  })

  test('not on a Mac, without the developer tools or swiftc, or when it does not build: what is missing', async () => {
    expect(await prepareOverlay(world({ platform: 'Linux' }).d)).toEqual({ missing: MAC_ONLY })
    const noTools = world({ xcode: false })
    expect(await prepareOverlay(noTools.d)).toEqual({ missing: SWIFT_MISSING })
    expect(noTools.ran.some(a => a[0] === 'xcrun')).toBe(false) // never the shim that offers an install
    expect(await prepareOverlay(world({ swiftc: false }).d)).toEqual({ missing: SWIFT_MISSING })
    expect(await prepareOverlay(world({ compiles: false }).d)).toEqual({ missing: 'The fullscreen overlay did not build: error: no such module WebKit' })
    expect(await prepareOverlay(world({ home: '' }).d)).toEqual({ missing: 'Fullscreen effects need HOME to be set.' })
  })
})

describe('the fullscreen host', () => {
  test('a one-shot: the screen under the pointer, then one overlay sized to it', async () => {
    const { d, spawned, children } = world()
    const host = fullscreenHost(d, '/bin/ov')
    const played = host.oneShot('confetti', 0.5)
    await flush()
    children[0]!.push({ t: 'shown', pid: 77 })
    await played
    expect(spawned[0]!.argv).toEqual(['/bin/ov', 'play'])
    const req = JSON.parse(spawned[0]!.input)
    expect(req).toMatchObject({ v: 1, screen: { x: 0, y: 0, w: 1000, h: 500 }, closeAfterMs: 8000 })
    expect(req.html).toContain('width:1000px;height:500px')
    expect(req.html).toContain('<body style="opacity:0.5">')
    children[0]!.push({ t: 'closed', why: 'signal' })
    children[0]!.push(null)
  })

  test('a persistent effect: its bound sent, ended by SIGTERM to its pid, told when it ends by itself', async () => {
    const { d, spawned, children, ran } = world()
    const host = fullscreenHost(d, '/bin/ov')
    let ended = 0
    const starting = host.persistent('aurora', 0.5, 60_000, () => ended++)
    await flush()
    children[0]!.push({ t: 'shown', pid: 4242 })
    const closer = await starting
    expect(JSON.parse(spawned[0]!.input).closeAfterMs).toBe(60_000)
    await closer.close()
    expect(ran).toContainEqual(['/bin/kill', '-TERM', '4242'])
    children[0]!.push({ t: 'closed', why: 'term' })
    children[0]!.push(null)
    await flush()
    expect(ended).toBe(1)
    ran.length = 0
    await closer.close() // gone already: no signal to a pid that may be another's now
    expect(ran).toEqual([])
  })

  test('an overlay that cannot open says why; a screen it cannot find is an error', async () => {
    const { d, children, w } = world()
    const host = fullscreenHost(d, '/bin/ov')
    const played = host.oneShot('hearts', -1)
    await flush()
    children[0]!.push({ t: 'error', message: 'not a play request' })
    await expect(played).rejects.toThrow('The fullscreen overlay did not open: not a play request')
    const silent = host.persistent('aurora', 0.5, 1000, () => {})
    await flush()
    children[1]!.push(null)
    await expect(silent).rejects.toThrow('The fullscreen overlay did not open')
    w.screenFails = true
    await expect(host.oneShot('hearts', -1)).rejects.toThrow('could not find the screen')
  })

  test("events from the child's output: stdout lines only, junk passed over", async () => {
    async function* chunks() {
      yield { stream: 'stderr', text: '{"t":"shown","pid":9}\n' }
      yield { stream: 'stdout', text: 'warning: something\n{"t":"shown",' }
      yield { stream: 'stdout', text: '"pid":9}\n{"t":"closed","why":"timeout"}\n' }
    }
    const got: OverlayEvent[] = []
    for await (const ev of eventsOf(chunks())) got.push(ev)
    expect(got).toEqual([
      { t: 'shown', pid: 9 },
      { t: 'closed', why: 'timeout' },
    ])
  })
})
