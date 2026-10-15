import { describe, expect, test } from 'claude-code/testing'

import { loopDoc, oneShotDoc } from '../hooks/drips/docs.ts'
import {
  BUILTIN_EFFECT_LIST,
  BUILTIN_EFFECTS,
  LOOP_EFFECTS,
  ONE_SHOT_EFFECTS,
  buildLoopHtml,
  buildOneShotHtml,
  GAME_EFFECTS,
  canonicalEffect,
  isGameEffect,
  oneShotSafetyMs,
  parseDripRecipe,
} from '../hooks/drips/effects.ts'
import {
  MISSILES_BLAST_MS,
  MISSILES_END_MS,
  MISSILES_TURRETS,
  MISSILES_BLAST_START,
  MISSILES_ROUND_MS,
  MISSILES_SAFETY_MS,
  MISSILES_SPEED_RANGE,
  dripMissiles,
  missilesLevel,
  missilesRating,
  missilesTuning,
} from '../hooks/drips/missiles.ts'

describe('the recipe grammar', () => {
  test('tokens in any order: -1 persistent, 0<n<1 opacity, a whole number the count (at most 10), the rest effects', () => {
    expect(parseDripRecipe('confetti')).toEqual({ count: 1, opacity: -1, effects: ['confetti'], level: 3 })
    expect(parseDripRecipe('3 hearts stars')).toEqual({ count: 3, opacity: -1, effects: ['hearts', 'stars'], level: 3 })
    expect(parseDripRecipe('aurora 0.4 -1')).toEqual({ count: -1, opacity: 0.4, effects: ['aurora'], level: 3 })
    expect(parseDripRecipe('50 Rain')).toEqual({ count: 10, opacity: -1, effects: ['rain'], level: 10 })
  })

  test('no effect named plays fireworks', () => {
    expect(parseDripRecipe('').effects).toEqual(['fireworks'])
    expect(parseDripRecipe('  4  ')).toEqual({ count: 4, opacity: -1, effects: ['fireworks'], level: 4 })
  })

  test('for a game the whole number is its level, 1..10, 3 when none; missile is missiles', () => {
    expect(parseDripRecipe('missiles 7')).toEqual({ count: 7, opacity: -1, effects: ['missiles'], level: 7 })
    expect(parseDripRecipe('Missile')).toEqual({ count: 1, opacity: -1, effects: ['missiles'], level: 3 })
    expect(parseDripRecipe('missiles 99').level).toBe(10)
    expect(canonicalEffect('missile')).toBe('missiles')
    expect(canonicalEffect('hearts')).toBe('hearts')
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

  test('the safety timeout: 8 s, 17 s for timme, the round + end screen + 10 s for missiles', () => {
    expect(oneShotSafetyMs('confetti')).toBe(8000)
    expect(oneShotSafetyMs('timme')).toBe(17000)
    expect(oneShotSafetyMs('missiles')).toBe(MISSILES_SAFETY_MS)
    expect(oneShotSafetyMs('missile')).toBe(MISSILES_SAFETY_MS)
    expect(MISSILES_SAFETY_MS).toBe(MISSILES_ROUND_MS + MISSILES_END_MS + 10_000)
  })
})

describe('documents for a host', () => {
  test('a one-shot: opacity on its body when named, its safety time', () => {
    const doc = oneShotDoc('hearts', 800, 600, 0.5)
    expect(doc.html).toContain('<body style="opacity:0.5">')
    expect(doc.closeAfterMs).toBe(8000)
    expect(doc.interactive).toBe(false)
    expect(oneShotDoc('hearts', 800, 600, -1).html).toContain('<body>\n')
  })

  test('a game: interactive, its level, its own backstop', () => {
    const doc = oneShotDoc('missiles', 800, 600, -1, 9)
    expect(doc.interactive).toBe(true)
    expect(doc.html).toContain('LEVEL=9,')
    expect(doc.closeAfterMs).toBe(MISSILES_SAFETY_MS)
  })

  test('a loop: its time bound', () => {
    const doc = loopDoc('matrix', 800, 600, 0.5, 12_000)
    expect(doc.closeAfterMs).toBe(12_000)
    expect(doc.interactive).toBe(false)
    expect(doc.html).toContain('body{opacity:0.5}')
  })
})

describe('missiles, the game', () => {
  test('registered as a game and a one-shot, listed, alias unlisted; only games are games', () => {
    expect(Object.keys(GAME_EFFECTS)).toEqual(['missiles'])
    expect(ONE_SHOT_EFFECTS.missiles).toBeDefined()
    expect(BUILTIN_EFFECTS).toContain('missiles')
    expect(BUILTIN_EFFECTS).not.toContain('missile')
    expect(isGameEffect('missiles')).toBe(true)
    expect(isGameEffect('missile')).toBe(true)
    for (const name of Object.keys(ONE_SHOT_EFFECTS).filter(n => n !== 'missiles')) expect(isGameEffect(name)).toBe(false)
  })

  test('the level is threaded into the document; default 3; clamped', () => {
    expect(buildOneShotHtml('missiles', 800, 600, 7)).toContain('LEVEL=7,')
    expect(buildOneShotHtml('missile', 800, 600)).toContain('LEVEL=3,')
    expect(buildOneShotHtml('missiles', 800, 600, 42)).toContain('LEVEL=10,')
    expect(dripMissiles(800, 600, 0)).toContain('LEVEL=1,')
    expect(buildOneShotHtml('gunfight', 800, 600, 7)).not.toContain('LEVEL=')
    expect(missilesLevel(Number.NaN)).toBe(3)
    expect(missilesLevel(6.6)).toBe(7)
  })

  test('level 1 easy, level 10 near-impossible: more, faster, more at once, smaller blast, a reload, splits from 7', () => {
    const one = missilesTuning(1)
    const ten = missilesTuning(10)
    expect(one.count).toBe(12)
    expect(ten.count).toBe(40)
    expect(ten.fallS).toBeLessThan(one.fallS / 3)
    expect(ten.maxActive).toBeGreaterThan(one.maxActive)
    expect(ten.blastR).toBeLessThan(one.blastR * 0.6)
    expect(ten.reloadMs).toBeGreaterThan(one.reloadMs * 3)
    expect(ten.interceptorSpeed).toBeLessThan(one.interceptorSpeed)
    expect(ten.turretAim).toBeGreaterThan(one.turretAim)
    expect(missilesTuning(6).splitChance).toBe(0)
    expect(missilesTuning(7).splitChance).toBeGreaterThan(0)
    for (let l = 1; l < 10; l++) expect(missilesTuning(l + 1).fallS).toBeLessThan(missilesTuning(l).fallS)
  })

  test('the wave lands before the round ends, even at level 1', () => {
    const one = missilesTuning(1)
    expect(1400 + one.launchS * 1000 + (one.fallS * 1000) / MISSILES_SPEED_RANGE[0]).toBeLessThan(MISSILES_ROUND_MS)
  })

  test('each missile its own speed across a wide range; a blast starts small and grows', () => {
    const html = dripMissiles(1000, 700, 5)
    expect(MISSILES_SPEED_RANGE[1] / MISSILES_SPEED_RANGE[0]).toBeGreaterThan(4)
    expect(html).toContain('FALL/rnd(SPMIN,SPMAX)')
    expect(html).toContain(`B0=${MISSILES_BLAST_START}`)
    expect(MISSILES_BLAST_START).toBeLessThan(0.3)
  })

  test('the end screen rating', () => {
    expect(missilesRating(24, 24)).toContain('FLAWLESS')
    expect(missilesRating(20, 24)).toBe('ACE DEFENDER.')
    expect(missilesRating(12, 24)).toBe('HOLDING THE LINE.')
    expect(missilesRating(5, 24)).toBe('THE GROUND TOOK A BEATING.')
    expect(missilesRating(0, 24)).toBe('CRATER CITY.')
    expect(missilesRating(0, 0)).toContain('FLAWLESS')
  })

  test('the page: three turrets fire interceptors to the click; blasts live about 1.7 s; losing every turret ends the round', () => {
    const html = dripMissiles(1000, 700, 5)
    expect(MISSILES_TURRETS).toHaveLength(3)
    expect(html).toContain(`turrets=${JSON.stringify(MISSILES_TURRETS)}`)
    expect(html).toContain(`BLASTMS=${MISSILES_BLAST_MS}`)
    expect(MISSILES_BLAST_MS).toBeGreaterThanOrEqual(1000)
    expect(MISSILES_BLAST_MS).toBeLessThanOrEqual(2000)
    expect(html).toContain('shots.push(')
    expect(html).toContain('allLost=stats.turrets===0')
  })

  test('the page: crosshair, Esc closes, a backstop of its own, a tinted backdrop that takes clicks', () => {
    const html = dripMissiles(1000, 700, 5)
    expect(html).toContain('cursor:crosshair')
    expect(html).toContain('ev.key==="Escape"')
    expect(html).toContain(`setTimeout(close,ROUND+ENDMS+600)`)
    expect(html).toContain('background:rgba(6,8,22,0.38)')
    expect(MISSILES_ROUND_MS + MISSILES_END_MS + 600).toBeLessThan(MISSILES_SAFETY_MS)
  })
})
