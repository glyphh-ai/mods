import type { On, RenderPropsOf } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { QUICK_EFFECTS } from '../hooks/drips/hooks.tsx'
import { SWIFT_MISSING } from '../hooks/overlay/host.ts'
import { CLAUDE_WINDOW, T0, startSession, world, type WorldOptions } from './engine.ts'
import { SITE_SIGNED_DRIP } from './fakes.ts'

const HINT: RenderPropsOf['PromptHint'] = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 } } as never
const SURFACES = ['terminal', 'desktop'] as const
const LOCKED = 'Drips is a one-time $8. Run /drips unlock to buy it.'

/** A session of the mod, bought on this machine unless the store says otherwise. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, { licence: SITE_SIGNED_DRIP, ...store })
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  // The engine's own drawing beneath the plugins: its hint line, and an empty band.
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return e.component === 'PromptHint' ? Text({ dimColor: true, children: (e.props as { hint: string }).hint }) : Box({})
  })
  await startSession($)
  return { ...w, clock }
}

async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

const keysOf = async (ui: { findAll(q: { type: string }): Promise<{ key: string | undefined }[]> }) => (await ui.findAll({ type: 'Button' })).map(b => b.key)

describe('the Drips button by the prompt', () => {
  for (const surface of SURFACES) {
    test(`on ${surface}: one button beside the engine's hint; the row above is closed`, async ($, on) => {
      await started($, on)
      const hint = await $.ui.mount({ plugin: 'drips', surface, component: 'PromptHint', props: HINT })
      expect(await keysOf(hint)).toEqual(['drips'])
      expect((await hint.find({ key: 'drips' }))?.text).toBe('💧 Drips')
      expect(await hint.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
      const band = await $.ui.mount({ plugin: 'drips', surface, component: 'AbovePrompt', props: BAND })
      expect(await keysOf(band)).toEqual([])
    })

    test(`on ${surface}: pressed, the row opens above the prompt with the quick plays and the saved drips; ✕ closes it`, async ($, on) => {
      await started($, on, { customs: { party: '3 hearts' } })
      const hint = await $.ui.mount({ plugin: 'drips', surface, component: 'PromptHint', props: HINT })
      const band = await $.ui.mount({ plugin: 'drips', surface, component: 'AbovePrompt', props: BAND })
      await hint.press({ key: 'drips' })
      expect(await keysOf(band)).toEqual([...QUICK_EFFECTS.map(e => `play:${e}`), 'drip:party', 'close'])
      await band.press({ key: 'close' })
      expect(await keysOf(band)).toEqual([])
      await hint.press({ key: 'drips' })
      await hint.press({ key: 'drips' })
      expect(await keysOf(band)).toEqual([])
    })
  }

  test("a quick play goes the way /drips does: over Claude's window", async ($, on) => {
    const { clock, overlays } = await started($, on, { customs: { party: '-1 aurora' } })
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'PromptHint', props: HINT })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drips' })
    await band.press({ key: 'play:fireworks' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id })
  })

  test('a quick play lets the pointer through: effects never take clicks; no game among them', async ($, on) => {
    const { clock, overlays } = await started($, on)
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'PromptHint', props: HINT })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drips' })
    expect(QUICK_EFFECTS).toEqual(['fireworks', 'confetti', 'hearts', 'stars', 'gunfight'])
    await band.press({ key: 'play:gunfight' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', interactive: false })
  })

  test('Stop shows while a saved persistent drip plays, and ends it', async ($, on) => {
    const { clock, overlays, ran } = await started($, on, { customs: { party: '-1 aurora' } })
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'PromptHint', props: HINT })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drips' })
    expect(await keysOf(band)).not.toContain('stop')
    await band.press({ key: 'drip:party' })
    await until(clock, () => overlays.length > 0)
    expect(await keysOf(band)).toContain('stop')
    await band.press({ key: 'stop' })
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    expect(await keysOf(band)).not.toContain('stop')
  })

  test('where the overlay cannot run, a play says why once and plays nothing', async ($, on) => {
    const { toasts, overlays } = await started($, on, {}, { noSwift: true })
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'PromptHint', props: HINT })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drips' })
    await band.press({ key: 'play:confetti' })
    await band.press({ key: 'play:hearts' })
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('not bought: the row says so and opens the Drips page to unlock; nothing plays', async ($, on) => {
    const { mcp, overlays } = await started($, on, { licence: null })
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'PromptHint', props: HINT })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drips' })
    expect(await keysOf(band)).toEqual(['open', 'close'])
    expect(await band.find({ text: new RegExp(LOCKED.replace(/[$().]/g, '\\$&')) })).toBeDefined()
    await band.press({ key: 'open' })
    expect(mcp).toContain('Claude_Browser.preview_start')
    expect(overlays).toEqual([])
  })

  test('a survey holds the band: the row yields to it', async ($, on) => {
    await started($, on)
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'PromptHint', props: HINT })
    await hint.press({ key: 'drips' })
    const band = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
    expect(await keysOf(band)).toEqual([])
  })

  test('hidden by its /config toggle: no button, no row', { options: { button: false } }, async ($, on) => {
    await started($, on)
    const hint = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'PromptHint', props: HINT })
    expect(await keysOf(hint)).toEqual([])
    const band = await $.ui.mount({ plugin: 'drips', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await keysOf(band)).toEqual([])
  })
})
