import { describe, expect, test } from 'claude-code/testing'

import { HELPER_FILES, linkTo, parseMessage, versionOf, type Fetch } from '../hooks/drips/link.ts'

describe("the page's messages", () => {
  test('each ask the page may make, and nothing else', () => {
    expect(parseMessage({ t: 'play', recipe: '3 hearts' })).toEqual({ t: 'play', recipe: '3 hearts' })
    expect(parseMessage({ t: 'stop' })).toEqual({ t: 'stop' })
    expect(parseMessage({ t: 'save', name: 'party', recipe: 'confetti', original: 'old' })).toEqual({ t: 'save', name: 'party', recipe: 'confetti', original: 'old' })
    expect(parseMessage({ t: 'save', name: 'party', recipe: 'confetti' })).toEqual({ t: 'save', name: 'party', recipe: 'confetti', original: null })
    expect(parseMessage({ t: 'delete', name: 'party' })).toEqual({ t: 'delete', name: 'party' })
    expect(parseMessage({ t: 'closed', effect: 'aurora' })).toEqual({ t: 'closed', effect: 'aurora' })
    expect(parseMessage({ t: 'play' })).toBeNull()
    expect(parseMessage({ t: 'save', name: 1, recipe: 'x' })).toBeNull()
    expect(parseMessage({ t: 'quit' })).toBeNull()
    expect(parseMessage(null)).toBeNull()
    expect(parseMessage('stop')).toBeNull()
  })
})

describe("the helper's requests", () => {
  function fake(answers: Record<string, unknown>, status = true) {
    const asked: { url: string; method: string; token: string | undefined; body: unknown }[] = []
    const fetch: Fetch = async (url, init) => {
      asked.push({ url, method: init.method, token: init.headers['X-Token'], body: init.body === undefined ? undefined : JSON.parse(init.body) })
      return { ok: status, text: JSON.stringify(answers[new URL(url).pathname] ?? {}) }
    }
    return { fetch, asked }
  }

  test('each request carries the token; what it sends and reads', async () => {
    const { fetch, asked } = fake({
      '/api/state': { version: 'v1', open: 2, viewport: { w: 800, h: 600 } },
      '/api/key': { key: 'once' },
      '/api/inbox': { messages: [{ t: 'stop' }, { t: 'bogus' }] },
    })
    const link = linkTo(fetch, 4100, 'tok')
    expect(await link.state()).toEqual({ version: 'v1', open: 2, viewport: { w: 800, h: 600 } })
    expect(await link.pageUrl()).toBe('http://127.0.0.1:4100/?k=once')
    expect(await link.inbox()).toEqual([{ t: 'stop' }])
    await link.library({ drips: [{ name: 'a', recipe: 'b' }], effects: ['confetti'], display: 'fullscreen' })
    await link.play({ kind: 'loop', effect: 'aurora', html: '<html>', closeAfterMs: 1000 })
    await link.close('aurora')
    await link.stop()
    await link.quit()
    expect(asked.every(a => a.token === 'tok' && a.url.startsWith('http://127.0.0.1:4100/'))).toBe(true)
    expect(asked.map(a => `${a.method} ${new URL(a.url).pathname}`)).toEqual([
      'GET /api/state',
      'POST /api/key',
      'GET /api/inbox',
      'POST /api/library',
      'POST /api/play',
      'POST /api/close',
      'POST /api/stop',
      'POST /api/quit',
    ])
    expect(asked[4]!.body).toEqual({ kind: 'loop', effect: 'aurora', html: '<html>', closeAfterMs: 1000 })
    expect(asked[5]!.body).toEqual({ effect: 'aurora' })
  })

  test('a state without a size or with nonsense reads as none; a refusal is an error', async () => {
    expect(await linkTo(fake({ '/api/state': { viewport: { w: 0, h: 5 } } }).fetch, 1, 't').state()).toEqual({ version: '', open: 0, viewport: null })
    expect(await linkTo(fake({ '/api/inbox': {} }).fetch, 1, 't').inbox()).toEqual([])
    await expect(linkTo(fake({}, false).fetch, 1, 't').stop()).rejects.toThrow('the Drips page answered /api/stop with an error')
  })

  test("the helper's version follows its code", async () => {
    expect(HELPER_FILES).toContain('server.mjs')
    expect(await versionOf(['a', 'b'])).toBe(await versionOf(['a', 'b']))
    expect(await versionOf(['a', 'b'])).not.toBe(await versionOf(['a', 'c']))
  })
})
