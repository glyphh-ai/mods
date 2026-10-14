import { describe, expect, test } from 'claude-code/testing'

import { NATIVE_BINDING, NATIVE_LINK_SCRIPT, cleanUserAgent, isWebUrl, nativeDecision, nativeToWebUrl, popupDecision, userAgentMetadata } from '../helper/popups.mjs'

const SLACK = 'https://app.slack.com/client/T1'

describe("the app's native-to-web table (force-web.ts)", () => {
  test('each native app maps to its web client', () => {
    expect(nativeToWebUrl('slack://open?team=T123', SLACK)).toBe('https://app.slack.com/client/T123')
    expect(nativeToWebUrl('slack://channel?id=C1', SLACK)).toBe('https://app.slack.com/client')
    expect(nativeToWebUrl('discord://-/channels/1', 'https://x.com')).toBe('https://discord.com/app')
    expect(nativeToWebUrl('msteams://teams.microsoft.com/l/x', 'https://x.com')).toBe('https://teams.microsoft.com')
    expect(nativeToWebUrl('zoommtg://zoom.us/join?confno=123456', 'https://x.com')).toBe('https://app.zoom.us/wc/123456/join')
    expect(nativeToWebUrl('zoomus://zoom.us/join', 'https://x.com')).toBe('https://app.zoom.us')
    expect(nativeToWebUrl('notion://www.notion.so/page', 'https://x.com')).toBe('https://notion.so')
  })

  test("an unknown app falls back to the page's own origin; nothing, when that is malformed too", () => {
    expect(nativeToWebUrl('figma://file/1', 'https://www.figma.com/files/x')).toBe('https://www.figma.com')
    expect(nativeToWebUrl('not a url', 'also not')).toBeNull()
  })

  test('web addresses', () => {
    expect(isWebUrl('https://a')).toBe(true)
    expect(isWebUrl('http://a')).toBe(true)
    expect(isWebUrl('about:blank')).toBe(true)
    expect(isWebUrl('slack://open')).toBe(false)
  })
})

describe('popups and navigations', () => {
  test('kept in panel: a popup loads in the same page, mapped when native; about: is swallowed', () => {
    const keep = (url: string) => popupDecision({ url, keepInPanel: true, parentUrl: SLACK })
    expect(keep('https://example.org/x')).toEqual({ action: 'same', url: 'https://example.org/x' })
    expect(keep('slack://open?team=T9')).toEqual({ action: 'same', url: 'https://app.slack.com/client/T9' })
    expect(keep('about:blank')).toEqual({ action: 'swallow' })
    expect(keep('')).toEqual({ action: 'swallow' })
    expect(popupDecision({ url: 'weird://x', keepInPanel: true, parentUrl: 'bad' })).toEqual({ action: 'swallow' })
  })

  test('not kept: a popup gets a page of its own over the cell; a native one is denied', () => {
    const own = (url: string) => popupDecision({ url, keepInPanel: false, parentUrl: SLACK })
    expect(own('https://example.org/x')).toEqual({ action: 'own' })
    expect(own('about:blank')).toEqual({ action: 'own' })
    expect(own('')).toEqual({ action: 'own' })
    expect(own('slack://open')).toEqual({ action: 'deny' })
  })

  test("a native app's address: its web client when kept in panel; otherwise the Mac opens it, for the known apps only", () => {
    expect(nativeDecision({ url: 'slack://open?team=T2', keepInPanel: true, parentUrl: SLACK })).toEqual({ action: 'same', url: 'https://app.slack.com/client/T2' })
    expect(nativeDecision({ url: 'x://y', keepInPanel: true, parentUrl: 'bad' })).toEqual({ action: 'ignore' })
    expect(nativeDecision({ url: 'slack://open', keepInPanel: false, parentUrl: SLACK })).toEqual({ action: 'system', url: 'slack://open' })
    expect(nativeDecision({ url: 'mailto:a@b.c', keepInPanel: false, parentUrl: SLACK })).toEqual({ action: 'system', url: 'mailto:a@b.c' })
    expect(nativeDecision({ url: 'file:///Applications/Calculator.app', keepInPanel: false, parentUrl: SLACK })).toEqual({ action: 'ignore' })
    expect(nativeDecision({ url: 'not a url', keepInPanel: false, parentUrl: SLACK })).toEqual({ action: 'ignore' })
    expect(nativeDecision({ url: 'https://example.org', keepInPanel: true, parentUrl: SLACK })).toBeNull()
  })

  test("the page's link catcher sends native links to the helper's binding, and lets web links be", () => {
    expect(NATIVE_LINK_SCRIPT).toContain(`${NATIVE_BINDING}(a.href)`)
    expect(NATIVE_LINK_SCRIPT).toContain('^(https?|about|javascript|blob|data):')
    expect(NATIVE_LINK_SCRIPT).toContain('preventDefault')
  })
})

describe('a clean user agent (home-view.ts cleanUserAgent)', () => {
  const HEADLESS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.54 Safari/537.36'

  test('no Headless, no Electron or app marks; an old Chrome is raised above the gate', () => {
    expect(cleanUserAgent(HEADLESS)).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Safari/537.36')
    expect(cleanUserAgent('Mozilla/5.0 Chrome/120.0.1 glyphh-client/1.6.2 Electron/30.0.0 Safari/537.36')).toBe('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36')
    expect(cleanUserAgent('Mozilla/5.0 Safari')).toBe('Mozilla/5.0 Safari')
  })

  test('client hints that say Google Chrome, never Headless', () => {
    const meta = userAgentMetadata(cleanUserAgent(HEADLESS), { arm: true })
    expect(meta.brands).toEqual([
      { brand: 'Google Chrome', version: '141' },
      { brand: 'Chromium', version: '141' },
      { brand: 'Not=A?Brand', version: '24' },
    ])
    expect(meta.fullVersionList[0]).toEqual({ brand: 'Google Chrome', version: '141.0.7390.54' })
    expect(meta).toMatchObject({ platform: 'macOS', architecture: 'arm', mobile: false, fullVersion: '141.0.7390.54' })
    expect(userAgentMetadata('Mozilla/5.0 (Windows NT 10.0) Safari').platform).toBe('Windows')
    expect(userAgentMetadata('Mozilla/5.0 (X11; Linux) Safari')).toMatchObject({ platform: 'Linux', architecture: 'x86', fullVersion: '140.0.0.0' })
  })
})
