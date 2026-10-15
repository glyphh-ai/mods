import { describe, expect, test } from 'claude-code/testing'

import { buildRecipe, checkDrip, countText, dripEmojis, filterDrips, parseRecipe, saveRefusal } from '../helper/builder.mjs'
import { isAllowed, isLocal, openKeys, sameSecret } from '../helper/gate.mjs'
import { CLOSE_SIGNAL, DRIP_Z, createRunner, makeFrame } from '../helper/runner.mjs'

describe("the editor's recipe builder", () => {
  test('a mode and effects make a recipe; the count is held to 2–10', () => {
    expect(buildRecipe({ mode: 'oneshot', count: 3, effects: ['confetti', '', 'stars'] })).toBe('confetti stars')
    expect(buildRecipe({ mode: 'counted', count: 4, effects: ['hearts'] })).toBe('4 hearts')
    expect(buildRecipe({ mode: 'counted', count: 40, effects: ['hearts'] })).toBe('10 hearts')
    expect(buildRecipe({ mode: 'counted', count: Number.NaN, effects: ['hearts'] })).toBe('3 hearts')
    expect(buildRecipe({ mode: 'persistent', count: 3, effects: ['aurora'] })).toBe('-1 aurora')
    expect(buildRecipe({ mode: 'oneshot', count: 3, effects: [] })).toBe('')
  })

  test('a saved recipe opens back into the fields', () => {
    expect(parseRecipe('-1 aurora matrix')).toEqual({ mode: 'persistent', count: 3, effects: ['aurora', 'matrix'] })
    expect(parseRecipe('5 hearts')).toEqual({ mode: 'counted', count: 5, effects: ['hearts'] })
    expect(parseRecipe('1 hearts')).toEqual({ mode: 'oneshot', count: 3, effects: ['1', 'hearts'] })
    expect(parseRecipe('  confetti  ')).toEqual({ mode: 'oneshot', count: 3, effects: ['confetti'] })
    expect(parseRecipe('')).toEqual({ mode: 'oneshot', count: 3, effects: [] })
  })

  test("a drip's icons: one emoji per distinct effect, numbers left out", () => {
    expect(dripEmojis('3 hearts hearts confetti 0.5 mystery')).toEqual(['❤️', '🎊', '✨'])
    expect(dripEmojis('')).toEqual([])
  })

  test('search matches a name or a recipe; the count reads naturally', () => {
    const drips = [
      { name: 'party', recipe: '3 confetti' },
      { name: 'calm', recipe: '-1 aurora' },
    ]
    expect(filterDrips(drips, 'AUR')).toEqual([drips[1]!])
    expect(filterDrips(drips, 'par')).toEqual([drips[0]!])
    expect(filterDrips(drips, '  ')).toEqual(drips)
    expect(countText(1)).toBe('1 drip')
    expect(countText(0)).toBe('0 drips')
  })

  test('Save needs at least one effect and a name, as the app says', () => {
    expect(checkDrip({ name: ' Party ', effects: ['confetti'] })).toEqual({ name: 'party' })
    expect(checkDrip({ name: 'party', effects: ['', ''] })).toEqual({ error: 'Select at least one effect.', field: null })
    expect(checkDrip({ name: '', effects: [''] })).toEqual({ error: 'Select at least one effect.', field: 'name' })
    expect(checkDrip({ name: ' ', effects: ['stars'] })).toEqual({ error: 'Please fill in all required fields.', field: 'name' })
  })
})

/** The page's means in memory: frames, timers the test fires, what the mod is told. */
function page() {
  const frames: { html: string; contentWindow: object; removed: boolean; remove(): void }[] = []
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = []
  const told: string[] = []
  const runner = createRunner({
    frame: html => {
      const f = { html, contentWindow: {}, removed: false, remove: () => void (f.removed = true) }
      frames.push(f)
      return f
    },
    later: (ms, fn) => {
      const t = { ms, fn, cancelled: false }
      timers.push(t)
      return t
    },
    cancel: t => {
      if (t) (t as { cancelled: boolean }).cancelled = true
    },
    loopClosed: effect => void told.push(effect),
  })
  const fire = () => timers.filter(t => !t.cancelled).forEach(t => t.fn())
  return { runner, frames, timers, told, fire }
}

describe('effects over the page', () => {
  test('a one-shot frame goes on its close signal, from its own window only, once', () => {
    const { runner, frames, timers } = page()
    runner.play({ kind: 'one-shot', effect: 'confetti', html: '<a>', closeAfterMs: 8000 })
    runner.play({ kind: 'one-shot', effect: 'hearts', html: '<b>', closeAfterMs: 8000 })
    runner.message(frames[0]!.contentWindow, 'hello')
    runner.message({}, CLOSE_SIGNAL)
    expect(frames.map(f => f.removed)).toEqual([false, false])
    runner.message(frames[0]!.contentWindow, CLOSE_SIGNAL)
    expect(frames.map(f => f.removed)).toEqual([true, false])
    expect(timers[0]!.cancelled).toBe(true)
  })

  test('a one-shot whose signal never comes goes when its time is up', () => {
    const { runner, frames, fire } = page()
    runner.play({ kind: 'one-shot', effect: 'cat', html: '<a>', closeAfterMs: 8000 })
    fire()
    expect(frames[0]!.removed).toBe(true)
  })

  test('a loop stays until closed, replaced, stopped, or its time is up (then the mod is told)', () => {
    const { runner, frames, told, fire } = page()
    runner.play({ kind: 'loop', effect: 'aurora', html: '<a>', closeAfterMs: 12_000 })
    expect(runner.loopsPlaying()).toBe(1)
    runner.play({ kind: 'loop', effect: 'aurora', html: '<b>', closeAfterMs: 12_000 })
    expect(frames[0]!.removed).toBe(true)
    runner.close('aurora')
    expect(frames[1]!.removed).toBe(true)
    runner.play({ kind: 'loop', effect: 'matrix', html: '<c>', closeAfterMs: 12_000 })
    runner.play({ kind: 'loop', effect: 'plasma', html: '<d>', closeAfterMs: 12_000 })
    runner.stopAll()
    expect(runner.loopsPlaying()).toBe(0)
    expect(told).toEqual([])
    runner.play({ kind: 'loop', effect: 'nebula', html: '<e>', closeAfterMs: 12_000 })
    fire()
    expect(told).toEqual(['nebula'])
    runner.close('nebula') // gone already
  })

  test('a one-shot name looped closes on its signal and tells the mod', () => {
    const { runner, frames, told } = page()
    runner.play({ kind: 'loop', effect: 'confetti', html: '<a>', closeAfterMs: 12_000 })
    runner.message(frames[0]!.contentWindow, CLOSE_SIGNAL)
    expect(told).toEqual(['confetti'])
  })

  test('a frame: sandboxed to scripts, click-through, full viewport, above everything', () => {
    const attrs: Record<string, string> = {}
    const appended: unknown[] = []
    const f = { setAttribute: (k: string, v: string) => void (attrs[k] = v), style: { cssText: '' }, srcdoc: '' }
    const doc = { createElement: () => f, body: { appendChild: (x: unknown) => void appended.push(x) } }
    makeFrame(doc, '<html>')
    expect(attrs).toEqual({ sandbox: 'allow-scripts', 'aria-hidden': 'true' })
    expect(f.style.cssText).toContain('pointer-events:none')
    expect(f.style.cssText).toContain(`z-index:${DRIP_Z}`)
    expect(f.style.cssText).toContain('position:fixed;inset:0')
    expect(f.srcdoc).toBe('<html>')
    expect(appended).toEqual([f])
  })
})

describe('the page server lets in only its own page', () => {
  test('the token, Host and Origin; one-time keys', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abd', 'abc')).toBe(false)
    expect(isLocal({ host: '127.0.0.1:4100' }, 4100)).toBe(true)
    expect(isLocal({ host: 'localhost:4100' }, 4100)).toBe(false)
    expect(isLocal({ host: '127.0.0.1:4100', origin: 'https://evil.example' }, 4100)).toBe(false)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 's' }, { port: 4100, secret: 's' })).toBe(true)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 'x' }, { port: 4100, secret: 's' })).toBe(false)
    let n = 0
    const keys = openKeys({ random: () => `key${++n}`, ttlMs: 1000 })
    const k = keys.issue(0)
    expect(keys.consume(k, 10)).toBe(true)
    expect(keys.consume(k, 20)).toBe(false)
  })
})

describe("the plan's limit on the page's saves", () => {
  const LINE = 'Your Free plan allows 2 saved drips. Pro lifts it: Upgrade in /drips.'
  const status = (limit: number | null, gate: string | null = null) => ({ gate, limits: { custom_drips: limit, fullscreen: 0 }, refusals: { custom_drips: LINE, fullscreen: null } })
  const two = [{ name: 'a', recipe: 'stars' }, { name: 'b', recipe: 'hearts' }]

  test('a new drip below the limit, or unlimited, saves; at the limit it is refused with the line', () => {
    expect(saveRefusal(status(3), two, 'c', '')).toBeNull()
    expect(saveRefusal(status(null), two, 'c', '')).toBeNull()
    expect(saveRefusal(status(2), two, 'c', '')).toBe(LINE)
    expect(saveRefusal({ gate: null, limits: { custom_drips: 2 }, refusals: {} }, two, 'c', '')).toBe("Your plan's limit is reached.")
  })

  test('saving one again, or renaming one, keeps the count', () => {
    expect(saveRefusal(status(2), two, 'a', 'a')).toBeNull()
    expect(saveRefusal(status(2), two, 'z', 'b')).toBeNull()
  })

  test('closed, the gate says why; before the plan is told, it waits', () => {
    expect(saveRefusal(status(5, 'Sign in to Glyphh to use Drips: /drips signin.'), two, 'c', '')).toBe('Sign in to Glyphh to use Drips: /drips signin.')
    expect(saveRefusal(null, two, 'c', '')).toBe('Your Glyphh plan is still being checked: try again in a moment.')
  })
})
