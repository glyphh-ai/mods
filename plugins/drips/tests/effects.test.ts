import { describe, expect, test } from 'claude-code/testing'

import { loopDoc, oneShotDoc } from '../hooks/drips/docs.ts'
import {
  BUILTIN_EFFECT_LIST,
  BUILTIN_EFFECTS,
  LOOP_EFFECTS,
  ONE_SHOT_EFFECTS,
  buildLoopHtml,
  buildOneShotHtml,
  oneShotSafetyMs,
  parseDripRecipe,
} from '../hooks/drips/effects.ts'

describe('the recipe grammar', () => {
  test('tokens in any order: -1 persistent, 0<n<1 opacity, a whole number the count (at most 10), the rest effects', () => {
    expect(parseDripRecipe('confetti')).toEqual({ count: 1, opacity: -1, effects: ['confetti'] })
    expect(parseDripRecipe('3 hearts stars')).toEqual({ count: 3, opacity: -1, effects: ['hearts', 'stars'] })
    expect(parseDripRecipe('aurora 0.4 -1')).toEqual({ count: -1, opacity: 0.4, effects: ['aurora'] })
    expect(parseDripRecipe('50 Rain')).toEqual({ count: 10, opacity: -1, effects: ['rain'] })
  })

  test('no effect named plays fireworks', () => {
    expect(parseDripRecipe('').effects).toEqual(['fireworks'])
    expect(parseDripRecipe('  4  ')).toEqual({ count: 4, opacity: -1, effects: ['fireworks'] })
  })

  test('a name the resolver knows expands to its effects', () => {
    const r = parseDripRecipe('party stars', n => (n === 'party' ? ['confetti', 'hearts'] : null))
    expect(r.effects).toEqual(['confetti', 'hearts', 'stars'])
  })
})

describe('the effects', () => {
  test('the list hides timme; the catalog lists one-shots then loops', () => {
    expect(BUILTIN_EFFECTS).not.toContain('timme')
    expect(BUILTIN_EFFECTS).toContain('confetti')
    expect(BUILTIN_EFFECT_LIST.filter(e => e.kind === 'loop').map(e => e.name)).toEqual(Object.keys(LOOP_EFFECTS))
    expect(BUILTIN_EFFECT_LIST[0]).toEqual({ name: 'fireworks', kind: 'one-shot' })
    expect(BUILTIN_EFFECT_LIST.some(e => e.name === 'timme')).toBe(false)
  })

  test('every one-shot document sizes to its host and signals its close both ways', () => {
    for (const name of Object.keys(ONE_SHOT_EFFECTS)) {
      const html = buildOneShotHtml(name, 640, 480)
      expect(html).toContain('width:640px;height:480px')
      expect(html).toContain('console.log("__drip_close__")')
      expect(html).toContain('window.parent.postMessage("__drip_close__","*")')
    }
  })

  test('an unknown name plays fireworks; a loop name looped carries its opacity and never closes itself', () => {
    expect(buildOneShotHtml('nope', 10, 10)).toContain('@keyframes')
    const loop = buildLoopHtml('aurora', 100, 100, 0.3)
    expect(loop).toContain('body{opacity:0.3}')
    expect(loop).not.toContain('__drip_close__')
    expect(buildLoopHtml('confetti', 100, 100, 0.3)).toContain('__drip_close__')
  })

  test('the safety timeout: 8 s, 17 s for timme', () => {
    expect(oneShotSafetyMs('confetti')).toBe(8000)
    expect(oneShotSafetyMs('timme')).toBe(17000)
  })
})

describe('documents for a host', () => {
  test('a one-shot: opacity on its body when named, its safety time', () => {
    const doc = oneShotDoc('hearts', 800, 600, 0.5)
    expect(doc.html).toContain('<body style="opacity:0.5">')
    expect(doc.closeAfterMs).toBe(8000)
    expect(oneShotDoc('hearts', 800, 600, -1).html).toContain('<body>\n')
  })

  test('a loop: its time bound', () => {
    const doc = loopDoc('matrix', 800, 600, 0.5, 12_000)
    expect(doc.closeAfterMs).toBe(12_000)
    expect(doc.html).toContain('body{opacity:0.5}')
  })
})
