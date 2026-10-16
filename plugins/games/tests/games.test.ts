import { describe, expect, test } from 'claude-code/testing'

import {
  CHICKN_END_MS,
  CHICKN_HOP_MS,
  CHICKN_RAMP_LANES,
  CHICKN_SAFETY_MS,
  CHICKN_START_LANES,
  CHICKN_TRAIN_SPEED,
  CHICKN_TRAIN_WARN_MS,
  chicknDifficulty,
  chicknTuning,
  dripChickn,
} from '../hooks/arcade/games/chickn.ts'
import {
  BLOCKS_COLOURS,
  BLOCKS_COLS,
  BLOCKS_END_MS,
  BLOCKS_FALL_MS,
  BLOCKS_LOCK_MS,
  BLOCKS_PIECES,
  BLOCKS_ROWS,
  BLOCKS_SAFETY_MS,
  BLOCKS_SHAKE_MAX,
  BLOCKS_SLIDE_MS,
  BLOCKS_SOFT_MS,
  BLOCKS_SPEEDUP,
  blocksFallMs,
  blocksLineScore,
  dripBlocks,
} from '../hooks/arcade/games/blocks.ts'
import {
  DASH_END_MS,
  DASH_GRAVITY,
  DASH_JUMP_BLOCKS,
  DASH_LEAD_IN,
  DASH_RAMP_BLOCKS,
  DASH_SAFETY_MS,
  DASH_SEED,
  DASH_SPEED,
  dashDifficulty,
  dashJumpReach,
  dashSpeed,
  dripDash,
} from '../hooks/arcade/games/dash.ts'
import {
  ROCKS_END_MS,
  ROCKS_EXTRA_LIFE,
  ROCKS_LIVES,
  ROCKS_POINTS,
  ROCKS_SAFETY_MS,
  ROCKS_SAUCER_WAVE,
  dripRocks,
  rocksWave,
} from '../hooks/arcade/games/rocks.ts'
import {
  MISSILES_BLAST_MS,
  MISSILES_BLAST_START,
  MISSILES_END_MS,
  MISSILES_RAMP_S,
  MISSILES_SAFETY_MS,
  MISSILES_SPEED_RANGE,
  MISSILES_TURRETS,
  dripMissiles,
  missilesDifficulty,
  missilesTuning,
} from '../hooks/arcade/games/missiles.ts'
import { GAMES, gameDoc, gameOf } from '../hooks/arcade/games/index.ts'
import { GAME_SCORE, GAME_SOUND } from '../hooks/arcade/games/shared.ts'

describe('the games', () => {
  test('five, in the order /games lists them, each by its own name and title', () => {
    expect(GAMES.map(g => g.name)).toEqual(['missiles', 'chickn', 'blocks', 'rocks', 'dash'])
    expect(GAMES.map(g => g.title)).toEqual(['Missile Command', 'Chickn', 'Blocks', 'Rocks', 'Dash'])
  })

  test('found by name or another name, any case, spaces trimmed; nothing else', () => {
    expect(gameOf('blocks')?.name).toBe('blocks')
    expect(gameOf('  Missile ')?.name).toBe('missiles')
    expect(gameOf('CHICKEN')?.name).toBe('chickn')
    expect(gameOf('block')?.name).toBe('blocks')
    expect(gameOf('rock')?.name).toBe('rocks')
    expect(gameOf('confetti')).toBeNull()
    expect(gameOf('')).toBeNull()
  })

  test('a game\'s document: interactive, its own backstop, the best to beat; Sounds off starts it muted', () => {
    for (const g of GAMES) {
      const on = gameDoc(g, 800, 600, 40, true)
      expect(on).toMatchObject({ interactive: true, closeAfterMs: g.safetyMs })
      expect(on.html).toContain('BEST=40,')
      expect(on.html).toContain('width:800px;height:600px')
      expect(on.html).not.toContain('__dripsQuiet=true')
      expect(gameDoc(g, 800, 600, 0, false).html).toMatch(/<body[^>]*><script>window.__dripsQuiet=true<\/script>/)
      expect(g.safetyMs).toBe(30 * 60_000)
    }
    expect(GAME_SOUND).toContain('if(window.__dripsQuiet===true)muted=true;')
  })

  test('a bad best is none', () => {
    for (const g of GAMES) {
      expect(g.build(800, 600, -5)).toContain('BEST=0,')
      expect(g.build(800, 600, 2.5)).toContain('BEST=0,')
    }
  })
})

describe('missiles, the game', () => {
  test('it never stops getting harder: 0 at the start, towards 1, never settling', () => {
    expect(missilesDifficulty(0)).toBe(0)
    expect(missilesDifficulty(-4)).toBe(0)
    expect(Math.abs(missilesDifficulty(MISSILES_RAMP_S) - (1 - Math.exp(-1)))).toBeLessThan(1e-12)
    for (let s = 10; s < 1200; s += 60) expect(missilesDifficulty(s + 60)).toBeGreaterThan(missilesDifficulty(s))
    expect(missilesDifficulty(1e6)).toBeLessThanOrEqual(1)
    // Games to pass the time: two thirds of the way to near impossible in 80 seconds.
    expect(MISSILES_RAMP_S).toBe(80)
  })

  test('the start easy, the far end near impossible: more, faster, more at once, smaller blast, slower reloads, splits, more points', () => {
    const a = missilesTuning(0)
    const z = missilesTuning(1)
    expect(z.fallS).toBeLessThan(a.fallS / 3)
    expect(z.intervalS).toBeLessThan(a.intervalS / 3)
    expect(z.maxActive).toBeGreaterThan(a.maxActive)
    expect(z.blastR).toBeLessThan(a.blastR * 0.6)
    expect(z.reloadMs).toBeGreaterThan(a.reloadMs * 3)
    expect(z.interceptorSpeed).toBeLessThan(a.interceptorSpeed)
    expect(z.turretAim).toBeGreaterThan(a.turretAim)
    expect(missilesTuning(0.6).splitChance).toBe(0)
    expect(missilesTuning(0.7).splitChance).toBeGreaterThan(0)
    expect(missilesTuning(0.8).splitInto).toBe(1)
    expect(z.splitInto).toBe(2)
    expect(a.points).toBe(10)
    expect(z.points).toBe(100)
    expect(missilesTuning(Number.NaN)).toEqual(a)
    expect(missilesTuning(7)).toEqual(z)
  })

  test('the page ramps between the two ends it is given, launches without end, and is over only when every turret is lost', () => {
    const html = dripMissiles(1000, 700, 40)
    expect(html).toContain(`E0=${JSON.stringify(missilesTuning(0))},E1=${JSON.stringify(missilesTuning(1))};`)
    expect(html).toContain(`RAMP=${MISSILES_RAMP_S * 1000},`)
    expect(html).toContain('if(allLost){state="end";')
    expect(html).not.toMatch(/\bROUND\b/)
    expect(html).toContain(`turrets=${JSON.stringify(MISSILES_TURRETS)}`)
    expect(html).toContain(`BLASTMS=${MISSILES_BLAST_MS}`)
    expect(html).toContain(`B0=${MISSILES_BLAST_START}`)
    expect(html).toContain(`SPMIN=${MISSILES_SPEED_RANGE[0]},SPMAX=${MISSILES_SPEED_RANGE[1]}`)
    expect(html).toContain(`ENDMS=${MISSILES_END_MS};`)
  })

  test('the score: posted as it rises, the best shown to beat, a new best said', () => {
    const html = dripMissiles(1000, 700, 40)
    expect(html).toContain(GAME_SCORE)
    expect(html).toContain('stats.score+=pts;postScore(stats.score);')
    expect(html).toContain('"   BEST "+Math.max(BEST,stats.score)')
    expect(html).toContain('"NEW BEST!"')
  })

  test('the page: crosshair, Esc closes, a tinted backdrop that takes clicks', () => {
    const html = dripMissiles(1000, 700)
    expect(html).toContain('cursor:crosshair')
    expect(html).toContain('ev.key==="Escape"')
    expect(html).toContain('background:rgba(6,8,22,0.38)')
  })
})

describe('chickn, the game', () => {
  test('the farther it goes, the harder: 0 at the start, towards 1, never settling', () => {
    expect(chicknDifficulty(0)).toBe(0)
    expect(chicknDifficulty(-3)).toBe(0)
    expect(Math.abs(chicknDifficulty(CHICKN_RAMP_LANES) - (1 - Math.exp(-1)))).toBeLessThan(1e-12)
    for (let l = 1; l < 400; l += 10) expect(chicknDifficulty(l + 10)).toBeGreaterThan(chicknDifficulty(l))
    // Games to pass the time: two thirds of the way to near impossible in 40 lanes.
    expect(CHICKN_RAMP_LANES).toBe(40)
  })

  test('the start a stroll, the far end near impossible: faster, denser traffic, shorter logs, more trains, a faster creep', () => {
    const a = chicknTuning(0)
    const z = chicknTuning(1)
    expect(z.carSpeed).toBeGreaterThan(a.carSpeed * 3)
    expect(z.carGap).toBeLessThan(a.carGap)
    expect(z.logSpeed).toBeGreaterThan(a.logSpeed)
    expect(z.logLength).toBeLessThan(a.logLength)
    expect(z.logLength).toBeGreaterThanOrEqual(2)
    expect(z.logGap).toBeGreaterThan(a.logGap)
    expect(z.trainEveryS).toBeLessThan(a.trainEveryS)
    expect(z.creep).toBeGreaterThan(a.creep * 3)
    expect(z.road + z.river + z.rail).toBeLessThan(1)
    expect(chicknTuning(Number.NaN)).toEqual(a)
    expect(chicknTuning(3)).toEqual(z)
  })

  test('the page: lanes made at their own difficulty, grass, roads, rivers and rail, a safe start, every way to lose', () => {
    const html = dripChickn(1000, 700, 25)
    expect(html).toContain(`E0=${JSON.stringify(chicknTuning(0))},E1=${JSON.stringify(chicknTuning(1))};`)
    expect(html).toContain(`RAMP=${CHICKN_RAMP_LANES},TRAINSPEED=${CHICKN_TRAIN_SPEED},`)
    expect(html).toContain('var d=kOf(i),tn=tune(d)')
    for (const kind of ['"grass"', '"road"', '"river"', '"rail"']) expect(html).toContain(kind)
    expect(html).toContain(`START=${CHICKN_START_LANES},`)
    expect(html).toContain(`HOP=${CHICKN_HOP_MS},`)
    expect(html).toContain(`WARN=${CHICKN_TRAIN_WARN_MS};`)
    expect(html).toContain(`ENDMS=${CHICKN_END_MS},`)
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'k==="w"', 'k==="a"', 'k==="s"', 'k==="d"']) expect(html).toContain(key)
    for (const end of ['SPLAT!', 'SPLASH!', 'SWEPT AWAY!', 'CHOO CHOO!', 'TOO SLOW!']) expect(html).toContain(`"${end}"`)
    expect(html).not.toMatch(/\bROUND\b/)
    expect(html).toContain('addEventListener("mousedown"')
    expect(html).toContain('k==="Escape"')
  })

  test('the top score: a line across its lane to beat, posted as it rises, a new best said', () => {
    const html = dripChickn(1000, 700, 25)
    expect(html).toContain('BEST=25,')
    expect(html).toContain('function drawBest(){')
    expect(html).toContain('drawBest();')
    expect(html).toContain(GAME_SCORE)
    expect(html).toContain('stats.score=player.row;postScore(stats.score);')
    expect(html).toContain('"NEW BEST!"')
  })
})

describe('the games\' sounds', () => {
  test('the games carry the sound kit, made in the page: no sound files', () => {
    for (const html of [dripMissiles(1000, 700), dripChickn(1000, 700)]) {
      expect(html).toContain(GAME_SOUND)
      expect(html).not.toMatch(/\.(mp3|wav|ogg|m4a)/)
    }
    expect(GAME_SOUND).toContain('window.AudioContext||window.webkitAudioContext')
    expect(GAME_SOUND).toContain('voices>=24')
  })

  test('M mutes and unmutes, remembered where the page may store it; the HUD says so', () => {
    expect(GAME_SOUND).toContain('localStorage.setItem("drips.muted"')
    for (const html of [dripMissiles(1000, 700), dripChickn(1000, 700)]) {
      expect(html).toContain('sfx.toggle()')
      expect(html).toContain('"M SOUND ON":"M MUTES"')
    }
  })

  test('missiles: a shot, a blast, a kill, a hit, a turret lost, an intro and an end tune', () => {
    const html = dripMissiles(1000, 700)
    expect(html).toContain('stats.fired++;sfx.tone(')
    expect(html).toContain('blast(sh.tx,sh.ty,P.blast,BLASTMS);sfx.noise(')
    expect(html).toContain('function destroy(m,i){\n  sfx.tone(')
    expect(html).toContain('"TURRET DOWN!","#4cc9f0");sfx.noise(')
    expect(html).toContain('state="end";endAt=t;endTune();')
  })

  test('chickn: hops and bumps, cars whooshing by, the train\'s bell and its flyby, logs that creak, every way to lose', () => {
    const html = dripChickn(1000, 700)
    expect(html).toContain('stats.hops++;sfx.tone(')
    expect(html).toContain('player.bump=now0;sfx.tone(')
    expect(html).toContain('function passBy(ln){')
    expect(html).toContain('passBy(ln);')
    expect(html).toContain('ln.ding=now;sfx.tone(1568')
    expect(html).toContain('A log creaks under the chicken')
    for (const end of ['SPLAT!', 'CHOO CHOO!', 'SPLASH!', 'SWEPT AWAY!']) expect(html).toContain(`why==="${end}"`)
    expect(html).toContain('stats.score%10===0')
    expect(html).toContain('endTune()')
  })
})

describe('blocks, the game', () => {
  test('its own look: a 12-wide well, seven pieces of four squares in Glyphh\'s colours', () => {
    expect(BLOCKS_COLS).toBe(12)
    expect(BLOCKS_ROWS).toBe(20)
    expect(Object.keys(BLOCKS_PIECES).sort()).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z'])
    for (const [kind, cells] of Object.entries(BLOCKS_PIECES)) {
      expect(cells).toHaveLength(4)
      expect(new Set(cells.map(c => c.join())).size).toBe(4)
      expect(BLOCKS_COLOURS[kind]).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(BLOCKS_COLOURS.I).toBe('#25c75e')
  })

  test('the more rows cleared, the faster they fall, without end, never under 45 ms', () => {
    expect(blocksFallMs(0)).toBe(800)
    expect(blocksFallMs(-5)).toBe(800)
    expect(blocksFallMs(Number.NaN)).toBe(800)
    for (let n = 0; n < 150; n += 10) expect(blocksFallMs(n + 10)).toBeLessThan(blocksFallMs(n))
    expect(blocksFallMs(10_000)).toBe(45)
    // Games to pass the time: 18% faster every ten rows, so 30 rows in is twice the start's speed.
    expect(BLOCKS_SPEEDUP).toBe(0.82)
    expect(blocksFallMs(30)).toBeLessThan(blocksFallMs(0) / 1.8)
  })

  test('several rows at once score more, and every row more the faster it goes', () => {
    expect([1, 2, 3, 4].map(n => blocksLineScore(n, 0))).toEqual([100, 300, 500, 800])
    expect(blocksLineScore(4, 25)).toBe(2400)
    expect(blocksLineScore(0, 0)).toBe(0)
    expect(blocksLineScore(9, Number.NaN)).toBe(800)
  })

  test('the page: the same fall and score as here, a seven-piece bag, turns that kick off walls, hold, pause, a landing mark', () => {
    const html = dripBlocks(1000, 700, 300)
    expect(html).toContain('function fallMs(){return Math.max(45,Math.round(FALL0*Math.pow(SPEEDUP,stats.lines/10)))}')
    expect(html).toContain(`FALL0=${BLOCKS_FALL_MS},SPEEDUP=${BLOCKS_SPEEDUP};`)
    expect(html).toContain('function lineScore(n){return [0,100,300,500,800][n]*(1+Math.floor(stats.lines/10))}')
    expect(html).toContain('bag=Object.keys(PIECES)')
    expect(html).toContain('var kicks=[[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]')
    expect(html).toContain(`COLS=${BLOCKS_COLS},ROWS=${BLOCKS_ROWS},ENDMS=${BLOCKS_END_MS},LOCK=${BLOCKS_LOCK_MS};`)
    expect(html).toContain(`SLIDE0=${BLOCKS_SLIDE_MS[0]},SLIDE=${BLOCKS_SLIDE_MS[1]},SOFT=${BLOCKS_SOFT_MS},`)
    // Down moves a row the moment it is pressed, then every BLOCKS_SOFT_MS while held.
    expect(html).toContain('else if(a==="soft")fast();')
    expect(html).toContain('function fast(){soft=true;')
    expect(html).toContain('fallAt=performance.now()+SOFT}')
    expect(BLOCKS_SOFT_MS).toBeLessThanOrEqual(50)
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '" ":"drop"', 'c:"hold"', 'p:"pause"', 'm:"mute"']) expect(html).toContain(key)
    expect(html).toContain('function landing(){')
    expect(html).toContain('ev.key==="Escape"')
    expect(gameOf('blocks')!.safetyMs).toBe(BLOCKS_SAFETY_MS)
    expect(BLOCKS_SAFETY_MS).toBe(30 * 60_000)
  })

  test('the top score: shown to beat, posted as it rises, a new best said; its own sounds', () => {
    const html = dripBlocks(1000, 700, 300)
    expect(html).toContain('BEST=300,')
    expect(html).toContain(GAME_SCORE)
    expect(html).toContain('postScore(stats.score)')
    expect(html).toContain('"NEW BEST!"')
    expect(html).toContain(GAME_SOUND)
    expect(dripBlocks(1000, 700, -1)).toContain('BEST=0,')
    expect(dripBlocks(1000, 700)).toContain('BEST=0,')
  })

  test('a cleared row bursts into shards in its tiles\' colours, with a boom and a shake', () => {
    const html = dripBlocks(1000, 700)
    expect(html).toContain('explode(full.map(function(r){return{r:r,cells:grid[r].slice()}}))')
    expect(html).toContain('col:COLOURS[kind]')
    expect(html).toContain('drawParts(dt);')
  })

  test('a landing shakes the well, harder the faster it came, never past the cap', () => {
    const html = dripBlocks(1000, 700)
    expect(html).toContain(`SHAKE=${BLOCKS_SHAKE_MAX},`)
    expect(html).toContain('function impact(rowsPerS){shake=Math.max(shake,CELL*Math.min(SHAKE,0.035*Math.sqrt(rowsPerS)))}')
    expect(html).toContain('impact(60+6*n);lock()')
    expect(html).toContain('restAt=now;impact(1000/every)')
    const amp = (rowsPerS: number) => Math.min(BLOCKS_SHAKE_MAX, 0.035 * Math.sqrt(rowsPerS))
    expect(amp(1000 / blocksFallMs(0))).toBeLessThan(0.05)
    expect(amp(1000 / 40)).toBeGreaterThan(amp(1000 / blocksFallMs(0)) * 3)
    expect(amp(60 + 6 * 20)).toBe(BLOCKS_SHAKE_MAX)
    expect(BLOCKS_SHAKE_MAX).toBeLessThanOrEqual(0.25)
  })

  test('the keys are drawn left of the well, right-aligned short of it', () => {
    const html = dripBlocks(1000, 700)
    expect(html).toContain('var kx=BX-CELL*0.9;')
    for (const key of ['"P PAUSE",kx', '"ESC QUIT",kx']) expect(html).toContain(key)
  })
})

describe('rocks, the game', () => {
  test('each wave more rocks (up to 14), 12% faster without end; a saucer from wave 3, more often and better aimed', () => {
    expect(rocksWave(1)).toEqual({ count: 4, speed: 1, saucerEveryS: 0, saucerMiss: 0 })
    expect(rocksWave(2).count).toBe(6)
    expect(rocksWave(50).count).toBe(14)
    for (let n = 1; n < 30; n++) expect(rocksWave(n + 1).speed).toBeGreaterThan(rocksWave(n).speed)
    expect(rocksWave(ROCKS_SAUCER_WAVE - 1).saucerEveryS).toBe(0)
    expect(rocksWave(ROCKS_SAUCER_WAVE).saucerEveryS).toBe(18)
    expect(rocksWave(ROCKS_SAUCER_WAVE + 4).saucerEveryS).toBeLessThan(rocksWave(ROCKS_SAUCER_WAVE).saucerEveryS)
    expect(rocksWave(40).saucerEveryS).toBe(6)
    expect(rocksWave(ROCKS_SAUCER_WAVE + 3).saucerMiss).toBeLessThan(rocksWave(ROCKS_SAUCER_WAVE).saucerMiss)
    expect(rocksWave(40).saucerMiss).toBe(0.05)
    expect(rocksWave(0)).toEqual(rocksWave(1))
    expect(rocksWave(Number.NaN)).toEqual(rocksWave(1))
  })

  test('the page: the same waves as here, three ships, one more every 10,000, the smaller the rock the more it is worth', () => {
    const html = dripRocks(1000, 700, 500)
    expect(html).toContain('function wave(n){var s=n>=SAUCERWAVE;return{count:Math.min(14,2+2*n),speed:Math.pow(1.12,n-1)')
    expect(html).toContain(`LIVES=${ROCKS_LIVES},EXTRA=${ROCKS_EXTRA_LIFE},PTS=${JSON.stringify(ROCKS_POINTS)},ENDMS=${ROCKS_END_MS},SAUCERWAVE=${ROCKS_SAUCER_WAVE};`)
    expect(ROCKS_POINTS.small).toBeGreaterThan(ROCKS_POINTS.mid)
    expect(ROCKS_POINTS.mid).toBeGreaterThan(ROCKS_POINTS.big)
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '" ":"fire"', 'p:"pause"', 'm:"mute"']) expect(html).toContain(key)
    expect(html).toContain('ev.key==="Escape"')
    expect(html).toContain('function wrap(o){')
    expect(gameOf('rocks')!.safetyMs).toBe(ROCKS_SAFETY_MS)
  })

  test('the top score: shown to beat, posted as it rises, a new best said; its own sounds', () => {
    const html = dripRocks(1000, 700, 500)
    expect(html).toContain('BEST=500,')
    expect(html).toContain('function addScore(n){stats.score+=n;postScore(stats.score);')
    expect(html).toContain('"NEW BEST!"')
    expect(html).toContain(GAME_SOUND)
    expect(dripRocks(1000, 700, 1.5)).toContain('BEST=0,')
  })
})

describe('dash, the game', () => {
  test('the same course every run: a fixed seed, laid as far as it is run', () => {
    const a = dripDash(1000, 700)
    expect(a).toContain(`SEED=${DASH_SEED};`)
    expect(a).toContain('function rand(){seed=(seed+0x6D2B79F5)>>>0;')
    // Only the look is left to chance: the course draws from its own seed alone.
    const lay = a.slice(a.indexOf('function lay(){'), a.indexOf('function solidBelow('))
    expect(lay).not.toContain('Math.random')
    expect(lay).not.toContain('rnd(')
    expect(dripDash(1000, 700)).toBe(a)
  })

  test('a quick, snappy jump, half a turn in the air; faster as it goes, without end', () => {
    const v0 = Math.sqrt(2 * DASH_GRAVITY * DASH_JUMP_BLOCKS)
    expect((2 * v0) / DASH_GRAVITY).toBeLessThan(0.45)
    expect(dripDash(1000, 700)).toContain('SPIN=Math.PI/(2*V0/G)')
    expect(dashSpeed(0)).toBe(DASH_SPEED[0])
    expect(DASH_SPEED[0]).toBe(10)
    for (let b = 0; b < 2000; b += 100) expect(dashSpeed(b + 100)).toBeGreaterThan(dashSpeed(b))
    expect(dashSpeed(1e6)).toBeLessThanOrEqual(DASH_SPEED[1])
    expect(dashDifficulty(-1)).toBe(0)
    expect(Math.abs(dashDifficulty(DASH_RAMP_BLOCKS) - (1 - Math.exp(-1)))).toBeLessThan(1e-12)
    expect(dashJumpReach(10)).toBeGreaterThan(3.5)
  })

  test('the course: a run-up past the title to a lone spike, then room after every piece to land', () => {
    const html = dripDash(1000, 700)
    expect(DASH_LEAD_IN * (1 / DASH_SPEED[0])).toBeGreaterThanOrEqual(2)
    expect(html).toContain('course=[{t:"spike",x:LEAD,y:0}]')
    expect(html).toContain('gap=Math.ceil(reach(s))+')
    for (const end of ['SPIKED!', 'CRASHED!']) expect(html).toContain(`"${end}"`)
    for (const key of ['" ":"jump"', 'ArrowUp:"jump"', 'p:"pause"', 'm:"mute"']) expect(html).toContain(key)
    expect(html).toContain('addEventListener("mousedown",function(ev){ev.preventDefault();press()})')
    expect(html).toContain(`ENDMS=${DASH_END_MS},`)
    expect(gameOf('dash')!.safetyMs).toBe(DASH_SAFETY_MS)
  })

  test('the top score: a flag on the course to pass, posted as it goes, a new best said; a beat that quickens', () => {
    const html = dripDash(1000, 700, 120)
    expect(html).toContain('BEST=120,')
    expect(html).toContain('function drawBest(){')
    expect(html).toContain('postScore(')
    expect(html).toContain('"NEW BEST!"')
    expect(html).toContain('var spb=60/(110+60*kOf(me.x))*1000/2')
    expect(html).toContain(GAME_SOUND)
  })
})
