// Worlds in memory for the tests: state Values, a store, process results,
// and a test signing key standing in for the server's.
import type { McpToolResult, ProcessRunResult } from 'claude-code'

import { getPublicKeyAsync, signAsync } from '../hooks/unlock/vendor/ed25519.ts'
import type { Store } from '../hooks/drips/library.ts'
import type { Value } from '../hooks/drips/window.ts'

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

export function memStore(entries: Record<string, unknown> = {}): Store & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>(Object.entries(entries))
  return { map, get: async k => map.get(k), set: async (k, v) => void map.set(k, v) }
}

export const done = (stdout = '', exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

export const mcpText = (text: string, isError = false): McpToolResult => ({ content: [{ type: 'text', text }], isError })

/** Lets pending promise work run. */
export const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// The test's own signing key, standing in for the server's.
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

export const payload = (mod = 'drips') => ({ v: 1, mod, install: 'i-1', session: 'cs_test_1', issued: '2026-10-14T00:00:00.000Z' })

// Signed by the server's dev key for mod "unlock-test" (the unlock test mod's fixture).
export const SITE_SIGNED_OTHER_MOD =
  'eyJ2IjoxLCJtb2QiOiJ1bmxvY2stdGVzdCIsImluc3RhbGwiOiJ0ZXN0LWluc3RhbGwtMDAwMCIsInNlc3Npb24iOiJjc190ZXN0X2ZpeHR1cmUiLCJpc3N1ZWQiOiIyMDI2LTEwLTE0VDAwOjAwOjAwLjAwMFoifQ.RB4U1vvMHEKYy0y6mxRz3yZE4bR-whB_SxydpnoZc2ZlZTo2f9YfM1lNS1F1tfaaZkuSGsl9_J1-sACJWX5VBg'

// Signed by the server's dev key for Drips: a licence the mod takes as it ships (server.ts's dev key).
export const SITE_SIGNED_DRIP =
  'eyJ2IjoxLCJtb2QiOiJkcmlwcyIsImluc3RhbGwiOiJ0ZXN0LWluc3RhbGwtMDAwMCIsInNlc3Npb24iOiJjc190ZXN0X2ZpeHR1cmUiLCJpc3N1ZWQiOiIyMDI2LTEwLTE1VDAwOjAwOjAwLjAwMFoifQ.vJqMXKry3SgS6FG7L8ij7-ORsBdUbUOqQl9UV6sDTJeP__Ms8XBg970Vpffh5f378CIEBTVTLUi7TMrxy0lDAA'
