import { describe, expect, test } from 'claude-code/testing'

import { parseLexical } from '../hooks/licence/canonical.ts'
import { PUBLIC_KEY } from '../hooks/licence/server.ts'
import { getPublicKeyAsync, signAsync } from '../hooks/licence/vendor/ed25519.ts'
import { fromBase64, payloadOf, verifyLicence, verifyText } from '../hooks/licence/verify.ts'
import { INSTALL, OTHER_INSTALL, PRO, PYTHON } from './licences.ts'

const SEED = new Uint8Array(32).map((_, i) => i + 7)
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A licence signed by the test's own key, over `canonical`, around `payload`. */
async function signed(payload: unknown, canonicalText = JSON.stringify(payload), encode = b64) {
  const sig = await signAsync(new TextEncoder().encode(canonicalText), SEED)
  return JSON.stringify({ payload, signature: encode(sig) })
}

const payload = { install_id: INSTALL, user_id: 'u', org_id: 'o', plan: 'Pro', mods: {}, expires_at: '2027-01-01T00:00:00Z' }

describe("the plan's licence, checked offline", () => {
  test("the server's licence checks out with the embedded key, for this install", async () => {
    const r = await verifyText(PRO, INSTALL)
    expect(r).toMatchObject({ payload: { plan: 'Pro', install_id: INSTALL, mods: { ada: { limits: { models: null, precedents: null } } } } })
  })

  test("the Python fixture (non-ASCII, floats, a big int) checks out: the signed bytes are Python's", async () => {
    expect('payload' in (await verifyText(PYTHON, INSTALL))).toBe(true)
  })

  test('a licence for another install is not used', async () => {
    expect(await verifyText(OTHER_INSTALL, INSTALL)).toEqual({ error: 'install' })
  })

  test('a changed payload, a changed signature, or another key fails the signature', async () => {
    expect(await verifyText(PRO.replace('"plan":"Pro"', '"plan":"Max"'), INSTALL)).toEqual({ error: 'signature' })
    expect(await verifyText(PRO.replace('"keys":1', '"keys":1.0'), INSTALL)).toEqual({ error: 'signature' })
    const sig = /"signature":"([^"]+)"/.exec(PRO)![1]!
    const flipped = sig.startsWith('A') ? `B${sig.slice(1)}` : `A${sig.slice(1)}`
    expect(await verifyText(PRO.replace(sig, flipped), INSTALL)).toEqual({ error: 'signature' })
    expect(await verifyText(PRO.replace(sig, 'not base64!'), INSTALL)).toEqual({ error: 'signature' })
    expect(await verifyText(await signed(payload), INSTALL)).toEqual({ error: 'signature' })
  })

  test('the key and signature read as standard base64 (the server) or base64url (the embedded key), padded or not', async () => {
    const key = await getPublicKeyAsync(SEED)
    for (const enc of [b64, b64url]) {
      const text = await signed(payload, JSON.stringify(payload, Object.keys(payload).sort()), enc)
      for (const keyText of [b64(key), b64url(key)]) expect(await verifyLicence(parseLexical(text), INSTALL, keyText)).toMatchObject({ payload: { plan: 'Pro' } })
    }
    expect(fromBase64(PUBLIC_KEY)).toHaveLength(32)
    expect(fromBase64(b64(fromBase64(PUBLIC_KEY)))).toEqual(fromBase64(PUBLIC_KEY))
    expect(() => fromBase64('a')).toThrow()
    expect(() => fromBase64('ab$c')).toThrow()
  })

  test('not JSON, or not the shape, is malformed', async () => {
    expect(await verifyText('nope', INSTALL)).toEqual({ error: 'malformed' })
    expect(await verifyText('{"payload":{}}', INSTALL)).toEqual({ error: 'malformed' })
    expect(await verifyText(JSON.stringify({ payload, signature: 5 }), INSTALL)).toEqual({ error: 'malformed' })
  })

  test("the payload's shape: mods a map of limits (the server's list of slugs is refused), dates that parse", () => {
    expect(payloadOf(payload)).toEqual(payload)
    expect(payloadOf({ ...payload, mods: { ada: { limits: { a: 1, b: null } }, gateway: {} } })).not.toBeNull()
    for (const bad of [
      null,
      [],
      { ...payload, mods: ['ada'] },
      { ...payload, mods: null },
      { ...payload, mods: { ada: null } },
      { ...payload, mods: { ada: { limits: { a: 'x' } } } },
      { ...payload, mods: { ada: { limits: [1] } } },
      { ...payload, plan: 1 },
      { ...payload, expires_at: 'soon' },
      { ...payload, limits: 3 },
    ]) expect(payloadOf(bad)).toBeNull()
  })
})
