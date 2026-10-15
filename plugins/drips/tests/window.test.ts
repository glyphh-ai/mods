import { describe, expect, test } from 'claude-code/testing'

import type { HelperState, Link, PagePlay } from '../hooks/drips/link.ts'
import { DEFAULT_VIEWPORT, readyPage, showPage, shownText, windowHost, type PageDeps } from '../hooks/drips/window.ts'
import { mcpText, value } from './fakes.ts'

function world(opts: { desktop?: boolean; refuses?: boolean; external?: boolean; opensAfter?: number } = {}) {
  const state: HelperState = { version: 'v', open: 0, viewport: { w: 900, h: 700 } }
  const played: PagePlay[] = []
  const closed: string[] = []
  const calls: string[] = []
  const asked: string[] = []
  const opened: string[] = []
  let polls = 0
  const link: Link = {
    state: async () => {
      if (opts.opensAfter !== undefined && ++polls > opts.opensAfter) state.open = 1
      return { ...state }
    },
    pageUrl: async () => 'http://127.0.0.1:4100/?k=once',
    library: async () => {},
    play: async p => void played.push(p),
    close: async effect => void closed.push(effect),
    stop: async () => {},
    inbox: async () => [],
    quit: async () => {},
  }
  const tab = value<string | null>(null)
  const d: PageDeps = {
    isDesktop: async () => opts.desktop ?? true,
    mcp: async (server, tool, args) => {
      calls.push(`${server}.${tool} ${JSON.stringify(args)}`)
      if (opts.refuses && tool === 'preview_start') return mcpText('Not allowed', true)
      return tool === 'preview_start' ? mcpText('{"tabId": "t9"}') : mcpText('ok')
    },
    openExternal: async url => {
      opened.push(url)
      return opts.external ?? true
    },
    ask: text => void asked.push(text),
    sleep: async () => {},
    link: async () => link,
    tab,
  }
  return { d, state, played, closed, calls, asked, opened, tab }
}

describe('opening the Drips page', () => {
  test('in the Browser pane by preview_start, with a one-time address; its tab kept', async () => {
    const { d, calls, tab } = world()
    expect(await showPage(d)).toBe('opened')
    expect(calls).toEqual(['Claude_Browser.preview_start {"url":"http://127.0.0.1:4100/?k=once"}'])
    expect(tab.now()).toBe('t9')
  })

  test('already open: its tab brought to the front, nothing opened again', async () => {
    const { d, calls, state, tab } = world()
    state.open = 1
    await tab.set(() => 't9')
    expect(await showPage(d)).toBe('open')
    expect(calls).toEqual(['Claude_Browser.tabs_select {"tabId":"t9"}'])
  })

  test('a page closed since: its old tab closed first', async () => {
    const { d, calls, tab } = world()
    await tab.set(() => 'old')
    await showPage(d)
    expect(calls[0]).toBe('Claude_Browser.tabs_close {"tabId":"old"}')
  })

  test('where the app refuses preview_start, Claude is asked, with only the one-time address', async () => {
    const { d, asked, tab } = world({ refuses: true })
    expect(await showPage(d)).toBe('asked')
    expect(asked).toEqual(['Open this page in the browser pane (it opens once): http://127.0.0.1:4100/?k=once'])
    expect(tab.now()).toBeNull()
  })

  test("outside the desktop app: the person's own browser, or the address to open", async () => {
    const { d, opened, calls } = world({ desktop: false })
    expect(await showPage(d)).toBe('external')
    expect(opened).toEqual(['http://127.0.0.1:4100/?k=once'])
    expect(calls).toEqual([])
    await expect(showPage(world({ desktop: false, external: false }).d)).rejects.toThrow('Open this page in your browser (it opens once): http://127.0.0.1:4100/?k=once')
  })

  test('what each says', () => {
    expect(shownText('open')).toBe('Drips page ✓')
    expect(shownText('opened')).toBe('Drips page ✓')
    expect(shownText('asked')).toBe('Drips page: Claude is asked to open it')
    expect(shownText('external')).toBe('Drips page: opened in your browser')
  })
})

describe('the page ready to play', () => {
  test('a page it opened is waited for; its size read', async () => {
    const { d } = world({ opensAfter: 3 })
    expect((await readyPage(d)).viewport).toEqual({ w: 900, h: 700 })
  })

  test('a page that never comes up, or one Claude is asked to open, is an error', async () => {
    await expect(readyPage(world().d)).rejects.toThrow('The Drips page did not open: run /drips, then play again.')
    await expect(readyPage(world({ refuses: true }).d)).rejects.toThrow('play again once it shows')
  })

  test('a page that has not said its size plays at the default', async () => {
    const { d, state } = world()
    state.open = 1
    state.viewport = null
    expect((await readyPage(d)).viewport).toEqual(DEFAULT_VIEWPORT)
  })
})

describe('the window host', () => {
  test("a one-shot goes to the page, sized to it", async () => {
    const { d, state, played } = world()
    state.open = 1
    await windowHost(d).oneShot('confetti', -1)
    expect(played[0]).toMatchObject({ kind: 'one-shot', effect: 'confetti', closeAfterMs: 8000 })
    expect(played[0]!.html).toContain('width:900px;height:700px')
  })

  test('a loop: closed by the mod, or ended by the page (told once)', async () => {
    const { d, state, played, closed } = world()
    state.open = 1
    const host = windowHost(d)
    let ended = 0
    const closer = await host.persistent('aurora', 0.5, 12_000, () => ended++)
    expect(played[0]).toMatchObject({ kind: 'loop', effect: 'aurora', closeAfterMs: 12_000 })
    await closer.close()
    await closer.close()
    expect(closed).toEqual(['aurora'])
    expect(ended).toBe(0)
    const again = await host.persistent('aurora', 0.5, 12_000, () => ended++)
    host.closed('aurora')
    host.closed('aurora')
    expect(ended).toBe(1)
    await again.close() // the page ended it already
    expect(closed).toEqual(['aurora'])
  })
})
