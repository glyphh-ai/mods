import { describe, expect, test } from 'claude-code/testing'

import { createAda, describe as describeHealth } from '../hooks/ada/core.ts'
import { runArgs } from '../hooks/ada/container.ts'
import { archOf, ASSETS, fileStem, installed, NO_PART, VERSION } from '../hooks/ada/part.ts'
import { account, deps, SHA } from './fakes.ts'

const stem = fileStem('arm64')
const build = (t: ReturnType<typeof deps>, folder = '/builds') => {
  t.world.w.files.set(`${folder}/${stem}.tar.gz`, 'tarball bytes')
  t.world.w.files.set(`${folder}/${stem}.sha256`, 'abc123\n')
  t.world.w.files.set(`${folder}/${stem}.sig`, 'c2ln\n')
}

describe('the Ada part and the licence, into rrotor', () => {
  test('the architecture, the file names, and whether rrotor holds the part', () => {
    expect(archOf('x86_64\n')).toBe('amd64')
    expect(archOf('arm64')).toBe('arm64')
    expect(stem).toBe(`ada-${VERSION}-arm64`)
    expect(installed([{ name: 'ada', version: VERSION, mod: 'ada', arch: 'arm64' }])).toBe(true)
    expect(installed([{ name: 'ada', version: '0.0.1', mod: 'ada', arch: 'arm64' }])).toBe(false)
    expect(ASSETS).toEqual({ amd64: null, arm64: null })
  })

  test('at the start: the licence handed to rrotor once, then the part installed from the folder in /config', async () => {
    const t = deps({ settings: { part: '/builds' } })
    t.rrotor.r.parts = []
    build(t)
    const p = createAda(t.d)
    expect((await p.ensure()).text).toBe(`rrotor is running in Docker. The Ada part ${VERSION} (arm64) is installed from /builds.`)
    const put = t.rrotor.r.calls.filter(c => c.url.endsWith('/v1/licence'))
    expect(put).toHaveLength(1)
    expect(put[0]!.body).toMatchObject({ payload: { plan: 'Pro', mods: { ada: { limits: { models: 3 } } } }, signature: 'sig' })
    const install = t.rrotor.r.calls.find(c => c.url.endsWith('/v1/parts') && c.method === 'POST')!
    expect(install.body).toEqual({ name: 'ada', version: VERSION, sha256: 'abc123', signature: 'c2ln', archive: btoa('tarball bytes') })
    expect(t.rrotor.r.parts).toEqual([{ name: 'ada', version: VERSION, mod: 'ada', arch: 'arm64' }])
    // again: the licence rrotor holds is this one, the part is there: nothing is sent
    t.rrotor.r.calls.length = 0
    expect((await p.ensure()).text).toBe('rrotor is running in Docker.')
    expect(t.rrotor.r.calls.filter(c => c.url.endsWith('/v1/licence') || (c.url.endsWith('/v1/parts') && c.method === 'POST'))).toEqual([])
    expect((await p.part()).text).toBe(`rrotor already holds the Ada part ${VERSION}.`)
  })

  test('without a folder, the release assets by URL; none in this build says so', async () => {
    const t = deps()
    t.rrotor.r.parts = []
    expect((await createAda(t.d).ensure()).text).toBe(NO_PART)
    ASSETS.arm64 = { url: 'https://github.com/glyphh-ai/mods/releases/download/v1/ada.tar.gz', sha256: 'deadbeef', signature: 'c2ln' }
    try {
      const again = deps()
      again.rrotor.r.parts = []
      expect((await createAda(again.d).ensure()).text).toBe(`rrotor is running in Docker. The Ada part ${VERSION} (arm64) is installed.`)
      const install = again.rrotor.r.calls.find(c => c.url.endsWith('/v1/parts') && c.method === 'POST')!
      expect(install.body).toEqual({ name: 'ada', version: VERSION, sha256: 'deadbeef', signature: 'c2ln', url: ASSETS.arm64.url })
    } finally {
      ASSETS.arm64 = null
    }
  })

  test('a folder without the three files, or rrotor refusing the part (not in the plan), is said', async () => {
    const t = deps({ settings: { part: '/builds' } })
    t.rrotor.r.parts = []
    t.world.w.files.set(`/builds/${stem}.tar.gz`, 'x')
    expect((await createAda(t.d).ensure()).text).toBe(`The Ada part folder has no ${stem}.tar.gz with its .sha256 and .sig.`)
    const noPlan = deps({ settings: { part: '/builds' }, account: account(null) })
    noPlan.rrotor.r.parts = []
    build(noPlan)
    expect((await createAda(noPlan.d).ensure()).text).toBe('Ada is not in your Pro plan. Upgrade in /ada.')
  })

  test('/ada shows the parts and the licence rrotor holds', async () => {
    const t = deps({ settings: { part: '/builds' } })
    build(t)
    const p = createAda(t.d)
    await p.ensure()
    const text = describeHealth(await p.health())
    expect(text).toContain(`parts: ada ${VERSION} · licence: Pro: ada`)
    expect(describeHealth({ ...(await p.health())!, parts: [], licence: null })).toContain('parts: none · licence: none')
    expect(describeHealth({ ...(await p.health())!, licence: { plan: 'Free', mods: [], expires_at: null, expired: true } })).toContain('licence: Free (expired): no mods')
  })

  test('rrotor is started with the two public keys in its environment', () => {
    const argv = runArgs({ kind: 'docker', cli: ['docker'] }, { image: 'i', port: 1, server: 'http://localhost:8080', tokenSha: 's', licenceKey: 'LK', releaseKey: 'RK' })
    expect(argv).toContain('RROTOR_LICENCE_PUBLIC_KEY=LK')
    expect(argv).toContain('RROTOR_RELEASE_PUBLIC_KEY=RK')
    void SHA
  })
})
