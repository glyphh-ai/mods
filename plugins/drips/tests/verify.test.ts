import { describe, expect, test } from 'claude-code/testing'

import { fromB64url, verify } from '../hooks/unlock/verify.ts'
import { SITE_SIGNED_OTHER_MOD, b64url, payload, sign, testPublicKey } from './fakes.ts'

describe('licence verify', () => {
  test('a licence signed for this mod checks out', async () => {
    const licence = await sign(payload())
    expect((await verify(licence, 'drips', await testPublicKey()))?.session).toBe('cs_test_1')
    expect(await verify(`  ${licence}\n`, 'drips', await testPublicKey())).not.toBeNull()
  })

  test('a licence for another mod does not', async () => {
    expect(await verify(await sign(payload('unlock-test')), 'drips', await testPublicKey())).toBeNull()
  })

  test("the site's key signs: its licence for another mod holds for that mod only", async () => {
    expect((await verify(SITE_SIGNED_OTHER_MOD, 'unlock-test'))?.mod).toBe('unlock-test')
    expect(await verify(SITE_SIGNED_OTHER_MOD, 'drips')).toBeNull()
  })

  test('a tampered payload or a licence signed by another key does not', async () => {
    const [body, sig] = (await sign(payload())).split('.')
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...payload(), install: 'someone-else' })))
    expect(await verify(`${forged}.${sig}`, 'drips', await testPublicKey())).toBeNull()
    expect(await verify(`${body}.${sig}`, 'drips')).toBeNull()
  })

  test('junk does not', async () => {
    const key = await testPublicKey()
    expect(await verify('not a licence', 'drips', key)).toBeNull()
    expect(await verify('a.b.c', 'drips', key)).toBeNull()
    expect(await verify('***.***', 'drips', key)).toBeNull()
    expect(await verify(await sign({ ...payload(), v: 2 }), 'drips', key)).toBeNull()
    expect(await verify(await sign('just text'), 'drips', key)).toBeNull()
  })

  test('base64url decodes, padded or not', () => {
    expect(Array.from(fromB64url('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(fromB64url('-_8='))).toEqual([251, 255])
    expect(() => fromB64url('a+b')).toThrow('not base64url')
  })
})
