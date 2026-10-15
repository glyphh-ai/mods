// Copied from shared/licence/verify.ts by scripts/sync-shared.mjs: edit it there.
// The plan's licence, checked here offline: the server signs its payload's
// canonical JSON (./canonical) with Ed25519, and the mod holds the public key
// (./server). The mods' environment has crypto.subtle.digest but no
// importKey, so the signature is checked by @noble/ed25519 (./vendor), which
// hashes with that digest. A licence for another install, or one whose
// signature does not hold, is never used.
import type { Limits, LicencePayload } from '../../types'
import { canonical, member, parseLexical, plain, type Lexical } from './canonical.ts'
import { PUBLIC_KEY } from './server.ts'
import { verifyAsync } from './vendor/ed25519.ts'

/** Bytes from base64, standard (the server's) or URL-safe, padded or not. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.trim().replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('not base64')
  const out: number[] = []
  let bits = 0
  let acc = 0
  for (const ch of clean) {
    acc = ((acc << 6) | ALPHABET.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export type Checked = { payload: LicencePayload } | { error: 'malformed' | 'signature' | 'install' }

const isLimits = (v: unknown): v is Limits =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => x === null || (typeof x === 'number' && Number.isFinite(x)))

/** The payload's shape: what the mod reads of it. */
export function payloadOf(v: unknown): LicencePayload | null {
  const p = v as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  for (const k of ['install_id', 'user_id', 'org_id', 'plan', 'expires_at']) if (typeof p[k] !== 'string') return null
  if (!Number.isFinite(Date.parse(p.expires_at as string))) return null
  if (p.limits !== undefined && (!p.limits || typeof p.limits !== 'object')) return null
  const mods = p.mods as Record<string, unknown> | null
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) return null
  for (const m of Object.values(mods)) {
    const limits = (m as { limits?: unknown } | null)?.limits
    if (!m || typeof m !== 'object' || (limits !== undefined && !isLimits(limits))) return null
  }
  return p as unknown as LicencePayload
}

/** A licence as the server answers GET /v1/license, `{ payload, signature }`,
 *  read keeping its numbers as written; checked for this install. */
export async function verifyLicence(licence: Lexical, installId: string, publicKey = PUBLIC_KEY): Promise<Checked> {
  const payload = member(licence, 'payload')
  const signature = member(licence, 'signature')
  const shaped = payload === undefined ? null : payloadOf(plain(payload))
  if (!shaped || typeof signature !== 'string') return { error: 'malformed' }
  try {
    const ok = await verifyAsync(fromBase64(signature), new TextEncoder().encode(canonical(payload!)), fromBase64(publicKey))
    if (!ok) return { error: 'signature' }
  } catch {
    return { error: 'signature' }
  }
  return shaped.install_id === installId ? { payload: shaped } : { error: 'install' }
}

/** The same, from the text of the server's answer. */
export async function verifyText(text: string, installId: string, publicKey = PUBLIC_KEY): Promise<Checked> {
  let lexical: Lexical
  try {
    lexical = parseLexical(text)
  } catch {
    return { error: 'malformed' }
  }
  return verifyLicence(lexical, installId, publicKey)
}
