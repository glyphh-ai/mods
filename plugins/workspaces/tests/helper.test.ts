import { describe, expect, test } from 'claude-code/testing'

import { isAllowed, isLocal, openKeys, sameSecret } from '../helper/gate.mjs'
import { addressOf, keyCalls, mouseCall, nulFramer } from '../helper/input.mjs'

describe('the layout page server lets in only its own page', () => {
  test('the token, compared whole', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abd', 'abc')).toBe(false)
    expect(sameSecret('ab', 'abc')).toBe(false)
    expect(sameSecret(undefined, 'abc')).toBe(false)
  })

  test('Host must be 127.0.0.1 and its port; an Origin must be its own', () => {
    expect(isLocal({ host: '127.0.0.1:4100' }, 4100)).toBe(true)
    expect(isLocal({ host: '127.0.0.1:4100', origin: 'http://127.0.0.1:4100' }, 4100)).toBe(true)
    expect(isLocal({ host: 'localhost:4100' }, 4100)).toBe(false)
    expect(isLocal({ host: 'evil.example:4100' }, 4100)).toBe(false)
    expect(isLocal({ host: '127.0.0.1:4100', origin: 'https://evil.example' }, 4100)).toBe(false)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 's' }, { port: 4100, secret: 's' })).toBe(true)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 'x' }, { port: 4100, secret: 's' })).toBe(false)
    expect(isAllowed({ host: 'localhost:4100', token: 's' }, { port: 4100, secret: 's' })).toBe(false)
  })

  test('a one-time key opens the page once, within its time', () => {
    let n = 0
    const keys = openKeys({ random: () => `key${++n}`, ttlMs: 1000 })
    const a = keys.issue(0)
    expect(keys.consume(a, 10)).toBe(true)
    expect(keys.consume(a, 20)).toBe(false)
    const b = keys.issue(0)
    expect(keys.consume(b, 1000)).toBe(false)
    const c = keys.issue(2000) // an expired key is cleared when the next is made
    expect(keys.consume(c, 2001)).toBe(true)
    expect(keys.consume(undefined, 0)).toBe(false)
    expect(keys.consume('never', 0)).toBe(false)
  })
})

describe("clicks and keys in Chrome's protocol", () => {
  test('a character types as text; a named key or a chord is a key event pair', () => {
    expect(keyCalls({ key: 'a' })).toEqual([['Input.insertText', { text: 'a' }]])
    expect(keyCalls({ key: 'return', shift: true })).toEqual([
      ['Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8, text: '\r' }],
      ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8 }],
    ])
    expect(keyCalls({ key: 'a', meta: true, ctrl: true, alt: true })[0]).toEqual([
      'Input.dispatchKeyEvent',
      { type: 'rawKeyDown', key: 'a', windowsVirtualKeyCode: 65, modifiers: 7 },
    ])
    expect(keyCalls({ key: 'Escape' })[0]?.[1]).toMatchObject({ key: 'Escape', type: 'rawKeyDown' })
  })

  test('mouse acts', () => {
    expect(mouseCall({ action: 'down', x: 3, y: 4, button: 'left', clicks: 2, mods: 8 })).toEqual([
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: 3, y: 4, button: 'left', clickCount: 2, modifiers: 8 },
    ])
    expect(mouseCall({ action: 'move', x: 'x' })).toEqual(['Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0, button: 'none', clickCount: 0, modifiers: 0 }])
    expect(mouseCall({ action: 'up' })[1]).toMatchObject({ type: 'mouseReleased', clickCount: 1 })
  })

  test('addresses as typed in a cell', () => {
    expect(addressOf('example.com')).toBe('https://example.com')
    expect(addressOf('http://x')).toBe('http://x')
  })

  test("Chrome's pipe: NUL-ended messages, split across chunks", () => {
    const got: unknown[] = []
    const feed = nulFramer(m => got.push(m))
    feed('{"id":1}\0{"id"')
    feed(':2}\0\0')
    expect(got).toEqual([{ id: 1 }, { id: 2 }])
  })
})
