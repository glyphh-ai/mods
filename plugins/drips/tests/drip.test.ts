import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { DAY_MS } from '../hooks/licence/access.ts'
import { BUILTIN_EFFECT_LIST } from '../hooks/drips/effects.ts'
import { PERSISTENT_CAP_MS, PREVIEW_MAX_MS } from '../hooks/drips/manager.ts'
import { NODE_MISSING } from '../hooks/drips/node.ts'
import { T0, callTool, endTurn, runCommand, startSession, world, type WorldOptions } from './engine.ts'

const ENDED = 'The Drips trial has ended. Unlock it for $5 in /drips.'

async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  const run = (command: string, args?: string) => runCommand($, command, args)
  return { ...w, clock, run }
}

/** Moves the clock until `done` holds: what a play starts finishes in the
 *  background, and on a slow machine it takes more than one turn of it. */
async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

describe("/drip in Claude's window (the default)", () => {
  test('the commands and tools are registered at the start', async ($, on) => {
    const { commands, tools } = await started($, on)
    expect(commands).toEqual(['drip', 'drips'])
    expect(tools).toEqual(['play_drip', 'list_drips'])
  })

  test('the first play opens the Drips page in the Browser pane, then plays there, sized to it', async ($, on) => {
    const { run, clock, page, mcp } = await started($, on)
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await until(clock, () => mcp.includes('Claude_Browser.preview_start') && page.played.length > 0 && page.library.length > 0)
    expect(mcp).toContain('Claude_Browser.preview_start')
    expect(page.played).toHaveLength(1)
    expect(page.played[0]).toMatchObject({ kind: 'one-shot', effect: 'confetti', closeAfterMs: 8000 })
    expect(page.played[0]!.html).toContain('width:1000px;height:700px')
    expect(page.library.at(-1)?.display).toBe('claude-window')
  })

  test('counted effects arrive 1500 ms apart', async ($, on) => {
    const { run, clock, page } = await started($, on)
    expect(await run('drip', '2 hearts stars')).toBe('drip: hearts + stars x2')
    await clock.advance(0)
    expect(page.played.map(p => p.effect)).toEqual(['hearts'])
    await clock.advance(1500)
    expect(page.played.map(p => p.effect)).toEqual(['hearts', 'stars'])
    await clock.advance(3000)
    expect(page.played.map(p => p.effect)).toEqual(['hearts', 'stars', 'hearts', 'stars'])
  })

  test('a persistent effect plays until fired again; /drip stop ends them all', async ($, on) => {
    const { run, page } = await started($, on)
    expect(await run('drip', '-1 aurora')).toBe('drip: aurora constant')
    expect(page.played[0]).toMatchObject({ kind: 'loop', effect: 'aurora', closeAfterMs: PERSISTENT_CAP_MS })
    await run('drip', '-1 aurora')
    expect(page.closed).toEqual(['aurora'])
    await run('drip', '-1 matrix nebula')
    expect(await run('drip', 'stop')).toBe('stopped all persistent effects')
    expect(page.closed).toEqual(['aurora', 'matrix', 'nebula'])
    expect(page.stops).toBe(1)
  })

  test('save, list and delete keep recipes in the store and show them on the page', async ($, on) => {
    const { run, page, clock } = await started($, on)
    expect(await run('drip', 'save Party 3 hearts')).toBe('saved drip "party" → 3 hearts')
    expect(await run('drip', 'list')).toContain('custom: party → 3 hearts')
    expect(await run('drip', 'party')).toBe('drip: hearts x3')
    await until(clock, () => page.library.at(-1)?.drips?.length === 1)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    expect(await run('drip', 'delete party')).toBe('deleted drip "party"')
    await until(clock, () => page.library.at(-1)?.drips?.length === 0)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('where the app refuses the Browser pane, Claude is asked to open the page and the play waits', async ($, on) => {
    const { run, clock, asked, page } = await started($, on, {}, { browserRefuses: true })
    expect(await run('drip', '-1 aurora')).toBe('/drip: The Drips page is opening in the browser pane: play again once it shows.')
    await clock.advance(0)
    expect(asked).toEqual(['Open this page in the browser pane (it opens once): http://127.0.0.1:' + page.alive!.port + '/?k=once'])
  })

  test('a page that never connects: the play says so', async ($, on) => {
    const { run, clock } = await started($, on, {}, { pageNeverOpens: true })
    const said = run('drip', '-1 aurora')
    await clock.advance(10_000)
    expect(await said).toBe('/drip: The Drips page did not open: run /drips, then play again.')
  })

  test('without Node the window cannot play: it says what to install', async ($, on) => {
    const { run } = await started($, on, {}, { noNode: true })
    expect(await run('drip', '-1 aurora')).toBe(`/drip: ${NODE_MISSING}`)
    expect(await run('drips')).toBe(NODE_MISSING)
  })
})

describe('/drips, the page', () => {
  test('opens the page; open already, it is brought to the front', async ($, on) => {
    const { run, mcp } = await started($, on)
    expect(await run('drips')).toBe('Drips page ✓')
    expect(await run('drips')).toBe('Drips page ✓')
    expect(mcp).toEqual(['Claude_Browser.preview_start', 'Claude_Browser.tabs_select'])
    expect(await run('drips', 'nonsense')).toBe('Usage: /drips [key <licence>]')
  })

  test("outside the desktop app it opens in the person's browser", async ($, on) => {
    const { run, ran } = await started($, on, {}, { surfaces: ['terminal'] })
    expect(await run('drips')).toBe('Drips page: opened in your browser')
    expect(ran.find(a => a[0] === 'open')?.[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?k=once$/)
  })

  test("the page's asks: a preview bounded to 12 s, a save (a rename drops the old name), a delete, a stop, a loop it ended", async ($, on) => {
    const { run, clock, page } = await started($, on, { customs: { old: 'stars' } })
    await run('drips')
    page.say({ t: 'play', recipe: '-1 matrix' })
    await clock.advance(1000)
    expect(page.played.at(-1)).toMatchObject({ kind: 'loop', effect: 'matrix', closeAfterMs: PREVIEW_MAX_MS })
    page.say({ t: 'closed', effect: 'matrix' })
    await clock.advance(1000)
    page.say({ t: 'play', recipe: '-1 matrix' }) // ended by the page: starts again, not toggled off
    await clock.advance(1000)
    expect(page.played.filter(p => p.effect === 'matrix')).toHaveLength(2)
    page.say({ t: 'stop' })
    await clock.advance(1000)
    expect(page.closed).toEqual(['matrix'])
    page.say({ t: 'save', name: 'Party', recipe: '3 hearts', original: 'old' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    page.say({ t: 'save', name: 'x', recipe: '3' })
    page.say({ t: 'delete', name: 'party' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('a reload finds the page again and clears what it was playing', async ($, on) => {
    const { run, page } = await started($, on)
    await run('drips')
    await startSession($)
    expect(page.starts).toBe(1)
    expect(page.stops).toBe(1)
  })
})

describe('fullscreen', () => {
  const FULL = { options: { display: 'fullscreen' } }

  test('builds the overlay with swiftc once, then plays each effect in its own overlay over the screen', FULL, async ($, on) => {
    const { run, clock, ran, overlays, page } = await started($, on)
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await clock.advance(0)
    expect(ran.filter(a => a[0] === '/usr/bin/swiftc')).toHaveLength(1)
    expect(overlays).toHaveLength(1)
    expect(overlays[0]!.request).toMatchObject({ v: 1, screen: { x: 0, y: 0, w: 1440, h: 900 }, closeAfterMs: 8000 })
    expect(overlays[0]!.request.html).toContain('width:1440px;height:900px')
    await run('drip', 'hearts')
    await clock.advance(0)
    expect(ran.filter(a => a[0] === '/usr/bin/swiftc')).toHaveLength(1)
    expect(overlays).toHaveLength(2)
    expect(page.played).toEqual([])
  })

  test('a persistent effect stays until fired again or stopped: its overlay is sent SIGTERM', FULL, async ($, on) => {
    const { run, ran, overlays } = await started($, on)
    await run('drip', '-1 aurora')
    expect(overlays[0]!.request.closeAfterMs).toBe(PERSISTENT_CAP_MS)
    await run('drip', '-1 aurora')
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    expect(overlays[0]!.ended).toBe(true)
    await run('drip', '-1 plasma')
    await run('drip', 'stop')
    expect(overlays[1]!.ended).toBe(true)
  })

  test("an overlay that ends by itself is forgotten", FULL, async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    await run('drip', '-1 aurora')
    overlays[0]!.end('timeout')
    await clock.advance(0)
    await run('drip', '-1 aurora')
    expect(overlays).toHaveLength(2)
  })

  test("without swiftc it plays in Claude's window, and says so once", FULL, async ($, on) => {
    const { run, clock, toasts, page, overlays } = await started($, on, {}, { noSwift: true })
    await run('drip', 'confetti')
    await clock.advance(0)
    await run('drip', 'hearts')
    await clock.advance(0)
    expect(toasts).toEqual(["Fullscreen effects need Swift: install the Xcode Command Line Tools (xcode-select --install). Playing in Claude's window instead."])
    expect(page.played.map(p => p.effect)).toEqual(['confetti', 'hearts'])
    expect(overlays).toEqual([])
  })

  test("a preview from the page plays in the page, never over the whole screen", FULL, async ($, on) => {
    const { run, clock, page, overlays } = await started($, on)
    await run('drips')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    expect(page.played.map(p => p.effect)).toEqual(['stars'])
    expect(overlays).toEqual([])
    expect(page.library.at(-1)?.display).toBe('fullscreen')
  })
})

describe('the tools Claude calls', () => {
  test('play_drip plays a recipe or stops; it does not save, delete or list', async ($, on) => {
    const { clock, page } = await started($, on)
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'fireworks' })).toEqual({ status: 'drip: fireworks' })
    await clock.advance(0)
    expect(page.played.map(p => p.effect)).toEqual(['fireworks'])
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'stop' })).toEqual({ status: 'stopped all persistent effects' })
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'save x confetti' })).toEqual({ error: 'play_drip takes a recipe or "stop"; list_drips lists the effects.' })
  })

  test("play_drip's failure is its result", async ($, on) => {
    await started($, on, {}, { browserRefuses: true })
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: '-1 aurora' })).toEqual({ error: 'The Drips page is opening in the browser pane: play again once it shows.' })
  })

  test("list_drips lists the effects and the person's drips", async ($, on) => {
    await started($, on, { customs: { party: '3 hearts' } })
    expect(await callTool($, 'mcp__drips__list_drips')).toEqual({ effects: BUILTIN_EFFECT_LIST, custom: [{ name: 'party', recipe: '3 hearts' }], running: [] })
  })
})

describe('the licence', () => {
  test('after the trial: plays and tools refuse; list, save, delete, stop and the page still work', async ($, on) => {
    const { run } = await started($, on, { trialStartedAt: T0 - DAY_MS * 7 })
    expect(await run('drip', 'confetti')).toBe(ENDED)
    expect(await run('drip')).toBe(ENDED)
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'confetti' })).toEqual({ error: ENDED })
    expect(await callTool($, 'mcp__drips__list_drips')).toEqual({ error: ENDED })
    expect(await run('drip', 'save a stars')).toBe('saved drip "a" → stars')
    expect(await run('drip', 'stop')).toBe('stopped all persistent effects')
    expect(await run('drips')).toBe('Drips page ✓')
  })

  test("after the trial a page's preview is refused with the reason", async ($, on) => {
    const { run, clock, page, toasts } = await started($, on, { trialStartedAt: T0 - DAY_MS * 9 })
    await run('drips')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    expect(page.played).toEqual([])
    expect(toasts).toContain(ENDED)
    expect(page.licence.at(-1)).toMatchObject({ kind: 'expired', product: 'Drips', command: '/drips' })
  })

  test('/drips key with junk does not unlock', async ($, on) => {
    const { run } = await started($, on, { trialStartedAt: T0 - DAY_MS * 8 })
    expect(await run('drips', 'key junk')).toBe('That licence key did not check out.')
    expect(await run('drip', 'confetti')).toBe(ENDED)
  })
})

describe('the fun hooks', () => {
  const FUN = { options: { matrix_while_tools: true, confetti_after_long_turn: true } }

  test('off unless set: a tool call and a long turn play nothing', async ($, on) => {
    const { page, clock } = await started($, on)
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await endTurn($, 10 * 60_000)
    await clock.advance(5000)
    expect(page.played).toEqual([])
  })

  test('a matrix while a tool runs, gone a moment after it; confetti after a turn over two minutes', FUN, async ($, on) => {
    const { page, clock } = await started($, on)
    await runCommand($, 'drips')
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await clock.advance(0)
    expect(page.played.map(p => `${p.kind} ${p.effect}`)).toEqual(['loop matrix'])
    await clock.advance(2000)
    expect(page.closed).toEqual(['matrix'])
    await endTurn($, 3 * 60_000)
    await clock.advance(0)
    expect(page.played.map(p => p.effect)).toEqual(['matrix', 'confetti'])
    await endTurn($, 30_000)
    await endTurn($, 3 * 60_000, { agentId: 'sub-1' })
    await clock.advance(0)
    expect(page.played).toHaveLength(2)
  })

  test("Drips' own tools and subagents' tools bring no matrix", FUN, async ($, on) => {
    const { page, clock } = await started($, on)
    await runCommand($, 'drips')
    await callTool($, 'mcp__drips__list_drips')
    await $.tool.call({ tool: 'Bash', input: { command: 'ls' }, agentId: 'sub-1' } as never)
    await clock.advance(0)
    expect(page.played).toEqual([])
  })
})
