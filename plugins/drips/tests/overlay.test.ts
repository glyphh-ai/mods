import { describe, expect, test } from 'claude-code/testing'

import {
  OVERLAY_CAP_MS,
  OVERLAY_MIN_MS,
  binaryPath,
  clampMs,
  compileArgv,
  digestOf,
  lineSplitter,
  parseEvent,
  parseScreen,
  playRequest,
} from '../hooks/drips/overlay.ts'

describe("the fullscreen overlay's protocol", () => {
  test('screen: one JSON line of the screen under the pointer', () => {
    expect(parseScreen('{"x":0,"y":0,"w":3440,"h":1440}\n')).toEqual({ x: 0, y: 0, w: 3440, h: 1440 })
    expect(parseScreen('{"x":-1512,"y":200,"w":1512,"h":982}')).toEqual({ x: -1512, y: 200, w: 1512, h: 982 })
    expect(parseScreen('{"x":0,"y":0,"w":0,"h":10}')).toBeNull()
    expect(parseScreen('{"x":"0","y":0,"w":1,"h":1}')).toBeNull()
    expect(parseScreen('garbage')).toBeNull()
  })

  test('play reads one request on stdin; its time is clamped to the cap', () => {
    const screen = { x: 0, y: 0, w: 100, h: 50 }
    expect(JSON.parse(playRequest('<html></html>', screen, 8000))).toEqual({ v: 1, html: '<html></html>', screen, closeAfterMs: 8000 })
    expect(JSON.parse(playRequest('', screen, 99 * 60_000)).closeAfterMs).toBe(OVERLAY_CAP_MS)
    expect(clampMs(5)).toBe(OVERLAY_MIN_MS)
    expect(clampMs(Number.NaN)).toBe(OVERLAY_CAP_MS)
    expect(clampMs(1234.6)).toBe(1235)
  })

  test("the overlay's events: shown with its pid, closed with why, or an error", () => {
    expect(parseEvent('{"t":"shown","pid":4242}')).toEqual({ t: 'shown', pid: 4242 })
    expect(parseEvent('{"t":"closed","why":"signal"}')).toEqual({ t: 'closed', why: 'signal' })
    for (const why of ['timeout', 'term', 'orphan']) expect(parseEvent(`{"t":"closed","why":"${why}"}`)).toEqual({ t: 'closed', why } as never)
    expect(parseEvent('{"t":"error","message":"not a play request"}')).toEqual({ t: 'error', message: 'not a play request' })
    expect(parseEvent('{"t":"closed","why":"bored"}')).toBeNull()
    expect(parseEvent('{"t":"shown","pid":0}')).toBeNull()
    expect(parseEvent('{"t":"other"}')).toBeNull()
    expect(parseEvent('not json')).toBeNull()
  })

  test('lines arrive in pieces and are put back together', () => {
    const split = lineSplitter()
    expect(split('{"t":"sho')).toEqual([])
    expect(split('wn","pid":1}\n{"t":')).toEqual(['{"t":"shown","pid":1}'])
    expect(split('"closed","why":"term"}\n\n')).toEqual(['{"t":"closed","why":"term"}'])
  })

  test('the binary is kept per version of its source, built by swiftc against AppKit and WebKit', async () => {
    const digest = await digestOf('print(1)')
    expect(digest).toMatch(/^[0-9a-f]{16}$/)
    expect(await digestOf('print(2)')).not.toBe(digest)
    expect(binaryPath('/Users/t/', digest)).toBe(`/Users/t/Library/Caches/glyphh-drips/drips-overlay-${digest}`)
    expect(compileArgv('/usr/bin/swiftc', 'a.swift', 'out')).toEqual(['/usr/bin/swiftc', '-O', '-o', 'out', 'a.swift', '-framework', 'AppKit', '-framework', 'WebKit'])
  })
})
