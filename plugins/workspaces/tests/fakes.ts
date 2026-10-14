// Worlds in memory for the tests: a Disk, state Values, a desktop App, and a
// test signing key standing in for the site's.
import type { McpToolResult, ProcessRunResult } from 'claude-code'

import { getPublicKeyAsync, signAsync } from '../hooks/licence/vendor/ed25519.ts'
import type { App, Value } from '../hooks/workspaces/desktop.ts'
import type { Disk } from '../hooks/workspaces/files.ts'

export const HOME = '/home/t'
export const DIR = `${HOME}/.glyphh/workspaces`

export function value<T>(initial: T): Value<T> & { now(): T } {
  let v = initial
  return {
    get: async () => v,
    set: async fn => {
      v = fn(v)
    },
    now: () => v,
  }
}

export function memDisk(home: string | null = HOME) {
  const files = new Map<string, string>()
  let kept: string[] = []
  const order = { get: async () => kept, set: async (slugs: string[]) => void (kept = slugs), now: () => kept }
  const disk: Disk = {
    home: async () => home ?? undefined,
    read: async p => {
      const t = files.get(p)
      if (t === undefined) throw new Error(`ENOENT ${p}`)
      return t
    },
    write: async (p, t) => void files.set(p, t),
    exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
    list: async dir =>
      [...files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')).map(p => p.slice(dir.length + 1)),
    remove: async p => void files.delete(p),
    rename: async (from, to) => {
      files.set(to, files.get(from)!)
      files.delete(from)
    },
    order,
  }
  const json = (slug: string) => JSON.parse(files.get(`${DIR}/${slug}.json`)!)
  return { disk, files, order, json }
}

export const done = (stdout = '', exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

export const mcpText = (text: string, isError = false): McpToolResult => ({ content: [{ type: 'text', text }], isError })

/** The desktop app in memory: its View menu, its browser's tabs, its folder. */
export function fakeApp() {
  const open = new Set<string>()
  const calls: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const tabs: { tabId: string; url: string }[] = []
  const files = new Set<string>()
  const world = {
    cwd: '/proj',
    menuFails: false,
    clickFails: new Set<string>(),
    browserRefuses: false,
    browserSilent: false,
    folderAnswer: 'ok' as 'ok' | 'error' | 'throw',
    findOut: '',
    findFails: false,
    nextTab: 1,
  }
  const app: App = {
    mcp: async (server, tool, args) => {
      calls.push(`${server}.${tool} ${JSON.stringify(args)}`)
      if (server === 'Claude_Browser') {
        if (world.browserRefuses) return mcpText('refused', true)
        if (world.browserSilent) return { content: [{ type: 'image' }], isError: true }
        if (tool === 'tabs_close') {
          const i = tabs.findIndex(t => t.tabId === args.tabId)
          if (i < 0) throw new Error('no such tab')
          tabs.splice(i, 1)
          return mcpText('closed')
        }
        const tabId = `t${world.nextTab++}`
        tabs.push({ tabId, url: String(args.url) })
        return mcpText(`{"tabId": "${tabId}"}`)
      }
      if (server === 'ccd_directory') {
        if (world.folderAnswer === 'throw') throw new Error('unreachable')
        return world.folderAnswer === 'error' ? mcpText('not allowed', true) : mcpText('moved')
      }
      return mcpText('shown')
    },
    run: async argv => {
      if (argv[0] === 'find') {
        if (world.findFails) throw new Error('find failed')
        return done(world.findOut)
      }
      const script = argv[2] ?? ''
      if (world.menuFails) return done('', 1, 'not allowed assistive access')
      if (script.includes('get name of every menu item')) {
        const items = (['Files', 'Changes', 'Terminal', 'Browser'] as const).map(l => `${open.has(l) ? 'Hide' : 'Show'} ${l}`)
        return done(`Reload, ${items.join(', ')}`)
      }
      const m = /click menu item "(Show|Hide) (\w+)"/.exec(script)!
      if (world.clickFails.has(m[2]!)) return done('', 1, `cannot click ${m[2]}`)
      if (m[1] === 'Show') open.add(m[2]!)
      else open.delete(m[2]!)
      calls.push(`menu ${m[1]} ${m[2]}`)
      return done()
    },
    cwd: async () => world.cwd,
    isFile: async p => files.has(p),
    toast: text => void toasts.push(text),
    ask: text => void asked.push(text),
  }
  return { app, open, calls, toasts, asked, tabs, files, world }
}

// The test's own signing key, standing in for the site's.
const SEED = new Uint8Array(32).map((_, i) => i + 1)

export function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const testPublicKey = async () => b64url(await getPublicKeyAsync(SEED))

/** A licence for `payload`, signed by the test key. */
export async function sign(payload: unknown): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${b64url(await signAsync(new TextEncoder().encode(body), SEED))}`
}

export const payload = (mod = 'workspaces') => ({ v: 1, mod, install: 'i-1', session: 'cs_test_1', issued: '2026-10-14T00:00:00.000Z' })

// Signed by the site's test key for mod "unlock-test" (the unlock test mod's fixture).
export const SITE_SIGNED_OTHER_MOD =
  'eyJ2IjoxLCJtb2QiOiJ1bmxvY2stdGVzdCIsImluc3RhbGwiOiJ0ZXN0LWluc3RhbGwtMDAwMCIsInNlc3Npb24iOiJjc190ZXN0X2ZpeHR1cmUiLCJpc3N1ZWQiOiIyMDI2LTEwLTE0VDAwOjAwOjAwLjAwMFoifQ.RB4U1vvMHEKYy0y6mxRz3yZE4bR-whB_SxydpnoZc2ZlZTo2f9YfM1lNS1F1tfaaZkuSGsl9_J1-sACJWX5VBg'
