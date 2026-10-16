import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { BUILTIN_EFFECT_LIST } from '../hooks/drips/effects.ts'
import { PERSISTENT_CAP_MS, PREVIEW_MAX_MS } from '../hooks/drips/manager.ts'
import { NODE_MISSING } from '../hooks/drips/node.ts'
import { MAC_ONLY, SWIFT_MISSING } from '../hooks/overlay/host.ts'
import { CLAUDE_DESKTOP } from '../hooks/overlay/target.ts'
import { CLAUDE_APP, CLAUDE_WINDOW, SCREEN, T0, callTool, endTurn, runCommand, startSession, world, type WorldOptions } from './engine.ts'
import { PAYMENT_LINK } from '../hooks/unlock/config.ts'
import { POLL_MS } from '../hooks/unlock/server.ts'
import { SITE_SIGNED_DRIP } from './fakes.ts'

const LOCKED = 'Drips is a one-time $8. Run /drips unlock to buy it.'
/** No licence on this machine: Drips not bought yet. */
const NOT_BOUGHT = { licence: null }
const MISSED = "Drips could not find Claude's window: effects play over the screen under the pointer."

/** A session of the mod, bought on this machine unless the store says otherwise. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, { licence: SITE_SIGNED_DRIP, ...store })
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

describe("/drips over Claude's window (the default)", () => {
  test('the commands and tools are registered at the start', async ($, on) => {
    const { commands, tools } = await started($, on)
    expect(commands).toEqual(['drips'])
    expect(tools).toEqual(['play_drip', 'list_drips'])
  })

  test("in the desktop app: the overlay is built once, finds the Claude app's largest window and follows it", async ($, on) => {
    const { run, clock, ran, overlays, windowAsks, page } = await started($, on, {}, { noNode: true })
    expect(await run('drips', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'desktop', bundleId: CLAUDE_DESKTOP, pid: CLAUDE_APP.pid, pick: 'largest' } }])
    expect(overlays[0]!.request).toMatchObject({ v: 2, frame: CLAUDE_WINDOW.frame, layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: 8000 })
    expect(overlays[0]!.request.html).toContain('width:1325px;height:1138px')
    await run('drips', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(ran.filter(a => a[1] === 'apps')).toHaveLength(1) // the ancestors are asked once a load
    expect(windowAsks).toHaveLength(2) // the window, each effect: it may have moved
    expect(page.starts).toBe(0) // no page, and no Node needed
  })

  test("in a terminal: the frontmost window of the terminal hosting Claude Code", async ($, on) => {
    const ghostty = { pid: 812, bundleId: 'com.mitchellh.ghostty', regular: true }
    const { run, clock, overlays, windowAsks } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [ghostty] })
    await run('drips', 'stars')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'terminal', bundleId: 'com.mitchellh.ghostty', pid: 812, pick: 'frontmost' } }])
  })

  test('in a terminal under tmux: the terminal the environment names', async ($, on) => {
    const env = { TERM_PROGRAM: 'tmux', __CFBundleIdentifier: 'com.googlecode.iterm2' }
    const { run, clock, overlays, windowAsks } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [], env })
    await run('drips', 'stars')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'terminal', bundleId: 'com.googlecode.iterm2', pid: null, pick: 'frontmost' } }])
  })

  test('no window found: over the screen under the pointer, said once', async ($, on) => {
    const { run, clock, overlays, toasts } = await started($, on, {}, { noWindow: true })
    await run('drips', 'confetti')
    await until(clock, () => overlays.length > 0)
    await run('drips', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual([MISSED])
  })

  test('nothing names a window (a terminal not known, no app above it): over the screen under the pointer', async ($, on) => {
    const { run, clock, overlays, windowAsks, toasts } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [] })
    await run('drips', 'confetti')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([])
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual([MISSED])
  })

  test('a persistent effect follows the window until fired again or stopped', async ($, on) => {
    const { run, ran, overlays } = await started($, on)
    await run('drips', '-1 aurora')
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: PERSISTENT_CAP_MS })
    await run('drips', 'stop')
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
  })

  test('without the Command Line Tools nothing plays: a toast says so once, the play says why', async ($, on) => {
    const { run, clock, toasts, overlays } = await started($, on, {}, { noSwift: true })
    expect(await run('drips', 'confetti')).toBe(`/drips: ${SWIFT_MISSING}`)
    expect(await run('drips', '-1 aurora')).toBe(`/drips: ${SWIFT_MISSING}`)
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'hearts' })).toBe(`Not played: ${SWIFT_MISSING}`)
    await clock.advance(5000)
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('not a Mac: nothing plays, said once', async ($, on) => {
    const { run, toasts, overlays } = await started($, on, {}, { notMac: true })
    expect(await run('drips', 'confetti')).toBe(`/drips: ${MAC_ONLY}`)
    expect(await run('drips', 'hearts')).toBe(`/drips: ${MAC_ONLY}`)
    expect(toasts).toEqual([MAC_ONLY])
    expect(overlays).toEqual([])
  })

  test('counted effects arrive 1500 ms apart', async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    expect(await run('drips', '2 hearts stars')).toBe('drip: hearts + stars x2')
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
    await clock.advance(1500)
    await until(clock, () => overlays.length > 1)
    expect(overlays).toHaveLength(2)
    await clock.advance(3000)
    await until(clock, () => overlays.length > 3)
    expect(overlays).toHaveLength(4)
  })

  test('save, list and delete keep recipes in the store and show them on the page', async ($, on) => {
    const { run, page, clock } = await started($, on)
    await run('drips', 'page')
    expect(await run('drips', 'save Party 3 hearts')).toBe('saved drip "party" → 3 hearts')
    expect(await run('drips', 'list')).toContain('custom: party → 3 hearts')
    expect(await run('drips', 'party')).toBe('drip: hearts x3')
    await until(clock, () => page.library.at(-1)?.drips?.length === 1)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    expect(await run('drips', 'delete party')).toBe('deleted drip "party"')
    await until(clock, () => page.library.at(-1)?.drips?.length === 0)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('a browser-pane stored by 1.1 plays over Claude\'s window', { options: { display: 'browser-pane' } }, async ($, on) => {
    const { run, clock, overlays, mcp } = await started($, on)
    expect(await run('drips', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id })
    expect(mcp).toEqual([])
  })
})

describe('/drips page', () => {
  test('opens the page; open already, it is brought to the front', async ($, on) => {
    const { run, mcp } = await started($, on)
    expect(await run('drips', 'page')).toBe('Drips page ✓')
    expect(await run('drips', 'page')).toBe('Drips page ✓')
    expect(mcp).toEqual(['Claude_Browser.preview_start', 'Claude_Browser.tabs_select'])
  })

  test("outside the desktop app it opens in the person's browser", async ($, on) => {
    const { run, ran } = await started($, on, {}, { surfaces: ['terminal'] })
    expect(await run('drips', 'page')).toBe('Drips page: opened in your browser')
    expect(ran.find(a => a[0] === 'open')?.[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?k=once$/)
  })

  test("the page's asks: a preview over Claude's window bounded to 12 s, a stop, a save (a rename drops the old name), a delete", async ($, on) => {
    const { run, clock, page, overlays, ran } = await started($, on, { customs: { old: 'stars' } })
    await run('drips', 'page')
    page.say({ t: 'play', recipe: '-1 matrix' })
    await clock.advance(1000)
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: PREVIEW_MAX_MS })
    page.say({ t: 'stop' })
    await clock.advance(1000)
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    page.say({ t: 'save', name: 'Party', recipe: '3 hearts', original: 'old' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    page.say({ t: 'save', name: 'x', recipe: '3' })
    page.say({ t: 'delete', name: 'party' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('a reload finds the page again', async ($, on) => {
    const { run, page } = await started($, on)
    await run('drips', 'page')
    await startSession($)
    expect(page.starts).toBe(1)
  })

  test("a preview where the overlay cannot run: the toast once, nothing plays", async ($, on) => {
    const { run, clock, page, toasts, overlays } = await started($, on, {}, { noSwift: true })
    await run('drips', 'page')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    page.say({ t: 'play', recipe: 'hearts' })
    await clock.advance(1000)
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('without Node there is no page: it says what to install', async ($, on) => {
    const { run } = await started($, on, {}, { noNode: true })
    expect(await run('drips', 'page')).toBe(NODE_MISSING)
  })
})

describe('fullscreen', () => {
  const FULL = { options: { display: 'fullscreen' } }

  test('builds the overlay with swiftc once, then plays each effect in its own overlay over the screen, above everything', FULL, async ($, on) => {
    const { run, clock, ran, overlays } = await started($, on)
    expect(await run('drips', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(overlays).toHaveLength(1)
    expect(overlays[0]!.request).toMatchObject({ v: 2, frame: SCREEN, layer: 'screen', follow: null, closeAfterMs: 8000 })
    expect(overlays[0]!.request.html).toContain('width:1440px;height:900px')
    await run('drips', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(overlays).toHaveLength(2)
  })

  test('a persistent effect stays until fired again or stopped: its overlay is sent SIGTERM', FULL, async ($, on) => {
    const { run, ran, overlays } = await started($, on)
    await run('drips', '-1 aurora')
    expect(overlays[0]!.request.closeAfterMs).toBe(PERSISTENT_CAP_MS)
    await run('drips', '-1 aurora')
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    expect(overlays[0]!.ended).toBe(true)
    await run('drips', '-1 plasma')
    await run('drips', 'stop')
    expect(overlays[1]!.ended).toBe(true)
  })

  test("an overlay that ends by itself is forgotten", FULL, async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    await run('drips', '-1 aurora')
    overlays[0]!.end('timeout')
    await clock.advance(0)
    await run('drips', '-1 aurora')
    expect(overlays).toHaveLength(2)
  })

  test("a preview from the page plays over the whole screen too, bounded to 12 s", FULL, async ($, on) => {
    const { run, clock, page, overlays } = await started($, on)
    await run('drips', 'page')
    page.say({ t: 'play', recipe: '-1 stars' })
    await clock.advance(1000)
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'screen', closeAfterMs: PREVIEW_MAX_MS })
    expect(page.library.at(-1)?.display).toBe('fullscreen')
  })
})

describe('the tools Claude calls', () => {
  test('play_drip plays a recipe or stops; it does not save, delete or list', async ($, on) => {
    const { clock, overlays } = await started($, on)
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'fireworks' })).toBe('drip: fireworks')
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'stop' })).toBe('stopped all persistent effects')
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'save x confetti' })).toBe('play_drip takes a recipe or "stop"; list_drips lists the effects.')
  })

  test("play_drip's failure is its result", async ($, on) => {
    await started($, on, {}, { notMac: true })
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: '-1 aurora' })).toBe(`Not played: ${MAC_ONLY}`)
  })

  test("list_drips lists the effects and the person's drips", async ($, on) => {
    await started($, on, { customs: { party: '3 hearts' } })
    expect(await callTool($, 'mcp__drips__list_drips')).toBe(JSON.stringify({ effects: BUILTIN_EFFECT_LIST, custom: [{ name: 'party', recipe: '3 hearts' }], running: [] }))
  })
})

describe('the licence', () => {
  test('bought: everything plays, fullscreen too, any number of saved drips; the page says so and copies the key', { options: { display: 'fullscreen' } }, async ($, on) => {
    const { run, clock, page, overlays, copied, toasts } = await started($, on)
    for (const name of ['a', 'b', 'c', 'd', 'e']) expect(await run('drips', `save ${name} stars`)).toBe(`saved drip "${name}" → stars`)
    expect(await run('drips', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.layer).toBe('screen')
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'hearts' })).toBe('drip: hearts')
    await run('drips', 'page')
    await clock.advance(1000)
    expect(page.licence.at(-1)).toMatchObject({ kind: 'licensed', product: 'Drips', price: '$8', command: '/drips' })
    page.licenceAsks.push('copy')
    await clock.advance(1000)
    expect(copied).toEqual([SITE_SIGNED_DRIP])
    expect(toasts).toContain('Licence key copied.')
    expect(await run('drips', 'unlock')).toBe('Drips is already unlocked on this machine.')
  })

  test('no trial: until it is bought, plays and tools refuse; list, save, delete, stop and the page still work', async ($, on) => {
    const { run } = await started($, on, { ...NOT_BOUGHT, customs: { party: '3 hearts' } })
    expect(await run('drips', 'confetti')).toBe(LOCKED)
    expect(await run('drips')).toContain(LOCKED) // as /games: the listing, ending with the locked line
    expect(await callTool($, 'mcp__drips__play_drip', { recipe: 'confetti' })).toBe(`Not played: ${LOCKED}`)
    expect(await callTool($, 'mcp__drips__list_drips')).toBe(`Not played: ${LOCKED}`)
    expect(await run('drips', 'save a stars')).toBe('saved drip "a" → stars')
    expect(await run('drips', 'list')).toContain('party')
    expect(await run('drips', 'delete party')).toBe('deleted drip "party"')
    expect(await run('drips', 'stop')).toBe('stopped all persistent effects')
    expect(await run('drips', 'page')).toBe('Drips page ✓')
  })

  test("not bought: a page's preview is refused with the reason, and the page shows Unlock", async ($, on) => {
    const { run, clock, page, toasts, overlays } = await started($, on, NOT_BOUGHT)
    await run('drips', 'page')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    expect(overlays).toEqual([])
    expect(toasts).toContain(LOCKED)
    expect(page.licence.at(-1)).toMatchObject({ kind: 'locked', product: 'Drips', price: '$8', command: '/drips' })
  })

  test('a kept licence that no longer checks out is dropped at the start', async ($, on) => {
    const { run } = await started($, on, { licence: 'eyJ2IjoxfQ.forged' })
    expect(await run('drips', 'confetti')).toBe(LOCKED)
  })

  test('/drips key unlocks with a licence bought elsewhere; junk does not; a usage line without one', async ($, on) => {
    const { run } = await started($, on, NOT_BOUGHT)
    expect(await run('drips', 'key')).toBe('Usage: /drips key <licence>')
    expect(await run('drips', 'key junk')).toBe('That licence key did not check out.')
    expect(await run('drips', 'confetti')).toBe(LOCKED)
    expect(await run('drips', `key ${SITE_SIGNED_DRIP}`)).toBe('Drips unlocked.')
    expect(await run('drips', 'confetti')).toBe('drip: confetti')
  })

  test('/drips unlock opens the Payment Link for this install, asks the server until it is paid, and unlocks', async ($, on) => {
    let paid = false
    const t = await started($, on, NOT_BOUGHT, { site: () => (paid ? { paid: true, licence: SITE_SIGNED_DRIP } : { paid: false }) })
    expect(await t.run('drips', 'unlock')).toBe("Checkout for Drips ($8, once) is open in your browser. Drips unlocks on its own when you've paid.")
    const link = t.ran.filter(a => a[0] === 'open').map(a => a[1]!).find(u => u.startsWith(PAYMENT_LINK))!
    expect(link).toMatch(new RegExp(`^${PAYMENT_LINK.replace(/[.?]/g, '\\$&')}\\?client_reference_id=[0-9a-f-]{36}$`))
    await t.clock.advance(POLL_MS)
    expect(t.siteAsks.at(-1)).toContain(`mod=drips&install=${link.split('=')[1]}`)
    expect(await t.run('drips', 'confetti')).toBe(LOCKED)
    paid = true
    await t.clock.advance(POLL_MS)
    await until(t.clock, () => t.toasts.includes('Drips unlocked. Thank you!'))
    expect(await t.run('drips', 'confetti')).toBe('drip: confetti')
  })

  test("the page's Unlock and Cancel: checkout opened, then the wait stopped", async ($, on) => {
    const t = await started($, on, NOT_BOUGHT)
    await t.run('drips', 'page')
    t.page.licenceAsks.push('buy')
    await t.clock.advance(1000)
    expect(t.ran.some(a => a[0] === 'open' && a[1]!.startsWith(PAYMENT_LINK))).toBe(true)
    await t.clock.advance(1000)
    expect(t.page.licence.at(-1)).toMatchObject({ kind: 'locked', isWaiting: true })
    t.page.licenceAsks.push('cancel')
    await t.clock.advance(1000)
    await t.clock.advance(1000)
    expect(t.page.licence.at(-1)).toMatchObject({ kind: 'locked', isWaiting: false, note: null })
    const asked = t.siteAsks.length
    await t.clock.advance(POLL_MS * 3)
    expect(t.siteAsks).toHaveLength(asked)
  })
})

describe('the fun hooks', () => {
  const FUN = { options: { matrix_while_tools: true, confetti_after_long_turn: true } }

  test('off unless set: a tool call and a long turn play nothing', async ($, on) => {
    const { clock, overlays } = await started($, on)
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await endTurn($, 10 * 60_000)
    await clock.advance(5000)
    expect(overlays).toEqual([])
  })

  test('a matrix while a tool runs, gone a moment after it; confetti after a turn over two minutes', FUN, async ($, on) => {
    const { overlays, clock } = await started($, on)
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.closeAfterMs).toBe(PERSISTENT_CAP_MS)
    await clock.advance(2000)
    await until(clock, () => overlays[0]!.ended)
    expect(overlays[0]!.ended).toBe(true)
    await endTurn($, 3 * 60_000)
    await until(clock, () => overlays.length > 1)
    expect(overlays).toHaveLength(2)
    await endTurn($, 30_000)
    await endTurn($, 3 * 60_000, { agentId: 'sub-1' })
    await clock.advance(0)
    expect(overlays).toHaveLength(2)
  })

  test("Drips's own tools and subagents' tools bring no matrix", FUN, async ($, on) => {
    const { overlays, clock } = await started($, on)
    await callTool($, 'mcp__drips__list_drips')
    await $.tool.call({ tool: 'Bash', input: { command: 'ls' }, agentId: 'sub-1' } as never)
    await clock.advance(0)
    expect(overlays).toEqual([])
  })
})
