import { describe, expect, test } from 'claude-code/testing'

import { faviconCandidates, faviconTarget, isIcon } from '../helper/favicon.mjs'
import { isAllowed } from '../helper/gate.mjs'

describe("the helper's favicon proxy", () => {
  test('asks only for http(s) pages', () => {
    expect(faviconTarget('https://mail.google.com/mail')?.href).toBe('https://mail.google.com/mail')
    expect(faviconTarget('http://localhost:3000')?.host).toBe('localhost:3000')
    expect(faviconTarget('file:///etc/passwd')).toBeNull()
    expect(faviconTarget('javascript:alert(1)')).toBeNull()
    expect(faviconTarget('not a url')).toBeNull()
    expect(faviconTarget(null)).toBeNull()
  })

  test("the page's own icons, absolute and largest first, then /favicon.ico", () => {
    const html = `<head>
      <link rel="stylesheet" href="/a.css">
      <link rel="icon" href="/small.png" sizes="16x16">
      <link href='icons/big.png' rel='icon' sizes='192x192'>
      <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
      <link rel="shortcut icon" href="/small.png">
      <link rel="icon">
    </head>`
    expect(faviconCandidates('https://example.com/app/page', html)).toEqual([
      'https://example.com/app/icons/big.png',
      'https://cdn.example.com/touch.png',
      'https://example.com/small.png',
      'https://example.com/favicon.ico',
    ])
    expect(faviconCandidates('https://example.com')).toEqual(['https://example.com/favicon.ico'])
    expect(faviconCandidates('ftp://example.com', html)).toEqual([])
  })

  test('serves only images, and not big ones', () => {
    expect(isIcon('image/png', 1200)).toBe(true)
    expect(isIcon('IMAGE/X-ICON', 1)).toBe(true)
    expect(isIcon('text/html', 1200)).toBe(false)
    expect(isIcon(undefined, 1200)).toBe(false)
    expect(isIcon('image/png', 0)).toBe(false)
    expect(isIcon('image/png', 512 * 1024 + 1)).toBe(false)
  })

  test('is behind the token and the local Host, like every route', () => {
    const port = 4100
    const secret = 'a'.repeat(48)
    expect(isAllowed({ host: '127.0.0.1:4100', token: secret }, { port, secret })).toBe(true)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 'b'.repeat(48) }, { port, secret })).toBe(false)
    expect(isAllowed({ host: '127.0.0.1:4100', token: undefined }, { port, secret })).toBe(false)
    expect(isAllowed({ host: 'evil.test:4100', token: secret }, { port, secret })).toBe(false)
  })
})
