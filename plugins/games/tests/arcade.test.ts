import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { SWIFT_MISSING } from '../hooks/overlay/host.ts'
import { CLAUDE_DESKTOP } from '../hooks/overlay/target.ts'
import { DEFAULT_SETTINGS, settingsOf } from '../hooks/arcade/settings.ts'
import { PAYMENT_LINK } from '../hooks/unlock/config.ts'
import { POLL_MS } from '../hooks/unlock/server.ts'
import { CLAUDE_APP, CLAUDE_WINDOW, SCREEN, T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'
import { SITE_SIGNED_ARCADE, SITE_SIGNED_DRIP } from './fakes.ts'

const LOCKED = 'Games is a one-time $8. Run /games unlock to buy it.'
const NOT_BOUGHT = { licence: null }

/** A session of the mod, bought on this machine unless the store says otherwise. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, { licence: SITE_SIGNED_ARCADE, ...store })
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  const run = (args = '') => runCommand($, 'games', args)
  return { ...w, clock, run }
}

async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

describe('/games', () => {
  test('registered at the start', async ($, on) => {
    const { commands } = await started($, on)
    expect(commands).toEqual(['games'])
  })

  test('alone, it lists every game with its title and your best', async ($, on) => {
    const { run } = await started($, on, { bestScores: { blocks: 1200 } })
    const text = (await run())!
    expect(text.split('\n')[0]).toBe('Games. /games <name> starts one:')
    for (const title of ['Missile Command', 'Chickn', 'Blocks', 'Rocks', 'Dash']) expect(text).toContain(title)
    expect(text).toContain('Blocks  ·  best 1200')
    expect(text).not.toContain('Rocks  ·  best')
    expect(text).not.toContain(LOCKED)
    expect(await run('list')).toBe(text)
    expect(await run('LIST')).toBe(text)
  })

  test('not bought: the list says how to buy it, and no game plays', async ($, on) => {
    const { run, overlays } = await started($, on, NOT_BOUGHT)
    expect(await run()).toContain(LOCKED)
    expect(await run('blocks')).toBe(LOCKED)
    expect(overlays).toEqual([])
  })

  test('an unknown game is said', async ($, on) => {
    const { run } = await started($, on)
    expect(await run('pong')).toBe('No game called "pong". /games list lists them.')
  })

  test("a game plays over Claude's window, takes the pointer, is drawn with your best, and keeps a better score", async ($, on) => {
    const { run, clock, overlays } = await started($, on, { bestScores: { blocks: 1200 } })
    expect(await run('Blocks')).toBe('Blocks: your best is 1200. Esc quits, M mutes.')
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, interactive: true, closeAfterMs: 30 * 60_000 })
    expect(overlays[0]!.request.html).toContain('BEST=1200,')
    expect(overlays[0]!.request.html).toContain('width:1325px;height:1138px')
    expect(overlays[0]!.request.html).not.toContain('__dripsQuiet=true')
    overlays[0]!.score(900)
    overlays[0]!.score(1500)
    overlays[0]!.end('signal')
    await until(clock, () => false)
    expect(await run('block')).toBe('Blocks: your best is 1500. Esc quits, M mutes.')
    expect(overlays[1]!.request.html).toContain('BEST=1500,')
    expect(await run('dash')).toBe('Dash. Esc quits, M mutes.')
  })

  test('fullscreen: over the whole screen', { options: { display: 'fullscreen' } }, async ($, on) => {
    const { run, overlays } = await started($, on)
    await run('rocks')
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'screen', follow: null, interactive: true })
  })

  test('Sounds off: the game starts muted', { options: { sounds: false } }, async ($, on) => {
    const { run, overlays } = await started($, on)
    await run('chickn')
    expect(overlays[0]!.request.html).toContain('<script>window.__dripsQuiet=true</script>')
  })

  test("no window found: over the screen under the pointer, said once", async ($, on) => {
    const { run, overlays, toasts } = await started($, on, {}, { noWindow: true })
    await run('missiles')
    await run('missiles')
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual(["Games could not find Claude's window: games play over the screen under the pointer."])
  })

  test('the overlay is built once a load and finds the Claude app', async ($, on) => {
    const { run, ran } = await started($, on)
    await run('missiles')
    await run('dash')
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(ran.filter(a => a[1] === 'apps')).toHaveLength(1)
    expect(CLAUDE_APP.bundleId).toBe(CLAUDE_DESKTOP)
  })

  test('without the Command Line Tools no game plays, and it says why', async ($, on) => {
    const { run, overlays } = await started($, on, {}, { noSwift: true })
    expect(await run('blocks')).toBe(SWIFT_MISSING)
    expect(overlays).toEqual([])
  })
})

describe('buying it', () => {
  test('/games unlock opens the Payment Link for this install, asks the server until it is paid, and unlocks', async ($, on) => {
    let paid = false
    const t = await started($, on, NOT_BOUGHT, { site: () => (paid ? { paid: true, licence: SITE_SIGNED_ARCADE } : { paid: false }) })
    expect(await t.run('unlock')).toBe("Checkout for Games ($8, once) is open in your browser. Games unlocks on its own when you've paid.")
    const link = t.ran.filter(a => a[0] === 'open').map(a => a[1]!).find(u => u.startsWith(PAYMENT_LINK))!
    expect(link).toMatch(new RegExp(`^${PAYMENT_LINK.replace(/[.?]/g, '\\$&')}\\?client_reference_id=[0-9a-f-]{36}$`))
    await t.clock.advance(POLL_MS)
    expect(t.siteAsks.at(-1)).toContain(`mod=games&install=${link.split('=')[1]}`)
    expect(await t.run('blocks')).toBe(LOCKED)
    paid = true
    await t.clock.advance(POLL_MS)
    await until(t.clock, () => t.toasts.includes('Games unlocked. Thank you!'))
    expect(await t.run('blocks')).toBe('Blocks. Esc quits, M mutes.')
    expect(await t.run('unlock')).toBe('Games is already unlocked on this machine.')
  })

  test("/games key unlocks with a licence bought elsewhere; another mod's licence, junk or none does not", async ($, on) => {
    const { run } = await started($, on, NOT_BOUGHT)
    expect(await run('key')).toBe('Usage: /games key <licence>')
    expect(await run('key junk')).toBe('That licence key did not check out.')
    expect(await run(`key ${SITE_SIGNED_DRIP}`)).toBe('That licence key did not check out.')
    expect(await run('blocks')).toBe(LOCKED)
    expect(await run(`key ${SITE_SIGNED_ARCADE}`)).toBe('Games unlocked.')
    expect(await run('blocks')).toBe('Blocks. Esc quits, M mutes.')
  })

  test('a kept licence that no longer checks out is dropped at the start', async ($, on) => {
    const { run } = await started($, on, { licence: 'eyJ2IjoxfQ.forged' })
    expect(await run('blocks')).toBe(LOCKED)
  })
})

describe('the /config rows', () => {
  test("Claude's window and sounds unless set otherwise", () => {
    expect(settingsOf({})).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ display: 'claude-window', sounds: true })
    expect(settingsOf({ display: 'fullscreen', sounds: false })).toEqual({ display: 'fullscreen', sounds: false })
    expect(settingsOf({ display: 'sideways', sounds: 'no' })).toEqual(DEFAULT_SETTINGS)
  })
})
