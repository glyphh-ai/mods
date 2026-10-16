import { describe, expect, test } from 'claude-code/testing'

import { INITIAL } from '../hooks/licence/access.ts'
import { createAda, describe as describeHealth, statusLine } from '../hooks/ada/core.ts'
import { account, deps, fakeRrotor, fakeWorld, ok, SHA } from './fakes.ts'

describe('rrotor installed and started', () => {
  test('a first start: the container made with the image, the port and the local token as its hash; then the runtime token handed in', async () => {
    const t = deps()
    t.rrotor.r.link = 'no_token'
    t.rrotor.r.upAfter = 2
    const p = createAda(t.d)
    expect(await p.ensure()).toEqual({ ok: true, text: 'rrotor is running in Docker.' })
    const local = t.store.get('rrotor') as { token: string; port: number }
    expect(local).toEqual({ token: '0'.repeat(64), port: 47701 })
    expect(t.world.w.container).toEqual({ running: true, token: `sha(${'0'.repeat(64)})`, image: 'rrotor:dev' })
    const put = t.rrotor.r.calls.find(c => c.url.endsWith('/v1/runtime/token'))!
    expect(put.body).toEqual({ runtime_id: '5f1c0a52-8d3e-4b7a-9c21-5e4f3a2b1c0d', token: 'runtime-token-1' })
    expect(put.headers.Authorization).toBe(`Bearer ${'0'.repeat(64)}`)
    expect(t.rrotor.r.calls.find(c => c.url.endsWith('/v1/runtime/local'))!.headers.Authorization).toBe('Bearer install-token')
  })

  test('the same container kept (started if stopped); a token already linked is not asked again', async () => {
    const t = deps()
    const p = createAda(t.d)
    await p.ensure()
    t.world.w.container!.running = false
    t.world.w.ran.length = 0
    await p.ensure()
    expect(t.world.w.ran.map(a => a[1])).toEqual(['inspect', 'start'])
    expect(t.rrotor.r.issued).toBe(0)
  })

  test('another image or token: the old container removed, a new one made (the data is on its volume)', async () => {
    const t = deps()
    t.world.w.container = { running: true, token: 'old', image: 'rrotor:old' }
    await createAda(t.d).ensure()
    expect(t.world.w.ran.map(a => a[1])).toEqual(expect.arrayContaining(['rm', 'run']))
    expect(t.world.w.container!.image).toBe('rrotor:dev')
  })

  test('refusals: closed by the plan, no runtime, no image pinned, the container failing, never answering, the server refusing', async () => {
    expect((await createAda(deps({ account: INITIAL }).d).ensure()).text).toBe('Sign in to Glyphh to use Ada: /ada signin.')
    expect((await createAda(deps({ account: account(null) }).d).ensure()).text).toBe('Ada is not in your Pro plan. Upgrade in /ada.')
    expect((await createAda(deps({ world: fakeWorld({ kinds: [] }) }).d).ensure()).text).toContain('needs a container runtime')
    expect((await createAda(deps({ settings: { image: '' } }).d).ensure()).text).toContain('pins no rrotor image')
    const failing = deps()
    failing.world.w.fail.add(' run ')
    expect(await createAda(failing.d).ensure()).toEqual({ ok: false, text: 'rrotor did not start: failed:  run' })
    const silent = deps()
    silent.rrotor.r.up = false
    expect((await createAda(silent.d).ensure()).text).toBe('rrotor started but does not answer.')
    const refused = deps()
    refused.rrotor.r.link = 'refused'
    refused.rrotor.r.serverStatus = 401
    expect((await createAda(refused.d).ensure()).text).toContain('did not give rrotor its token (401)')
  })

  test('signed out with rrotor refused: nothing is asked of the server', async () => {
    const t = deps()
    const p = createAda(t.d)
    await p.ensure()
    t.rrotor.r.link = 'refused'
    t.setAccount({ ...INITIAL })
    expect(await p.health()).toMatchObject({ link: { state: 'refused' } })
    expect(t.rrotor.r.issued).toBe(0)
  })

  test('health hands a new token in when rrotor was refused, then shows it online', async () => {
    const t = deps()
    const p = createAda(t.d)
    await p.ensure()
    t.rrotor.r.link = 'refused'
    await p.health()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(t.rrotor.r.issued).toBe(1)
    expect((await p.health())!.link.state).toBe('online')
  })

  test('stop keeps the data; stop with no runtime says why', async () => {
    const t = deps()
    const p = createAda(t.d)
    await p.ensure()
    expect(await p.stop()).toEqual({ ok: true, text: 'rrotor stopped. Its models and data are kept.' })
    expect(t.world.w.container!.running).toBe(false)
    expect((await createAda(deps({ world: fakeWorld({ kinds: [] }) }).d).stop()).ok).toBe(false)
  })
})

describe("the tools' work", () => {
  function ready() {
    const t = deps()
    t.world.w.git.set('rev-parse --verify', ok(`${SHA}\n`))
    t.world.w.git.set(`show ${SHA}:glyphh.json`, ok('{"name":"daily_sales"}'))
    t.world.w.git.set('merge-base --is-ancestor', ok())
    t.world.w.git.set('bundle', ok('QUJD'))
    return { ...t, p: createAda(t.d) }
  }

  test('deploy a folder: the bundle and its commit go to rrotor', async () => {
    const t = ready()
    expect(await t.p.deploy({ path: '/Users/t/daily_sales' })).toEqual({ ok: true, text: JSON.stringify({ model: 'daily_sales', version: 1, commit_sha: SHA }) })
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ bundle: 'QUJD', commit: SHA })
  })

  test('deploy a repo at a commit; neither is refused', async () => {
    const t = ready()
    expect((await t.p.deploy({ repo: 'me/daily_sales', commit: SHA })).ok).toBe(true)
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ repo: 'me/daily_sales', commit: SHA, token: null })
    expect((await t.p.deploy({})).text).toContain('takes a folder')
    expect((await t.p.deploy({ path: 'relative' })).text).toContain('absolute path')
  })

  test("a new model past the plan's models is refused; one already there deploys again", async () => {
    const t = ready()
    t.setAccount(account({ models: 1 }, 'Free'))
    t.rrotor.r.models = [{ name: 'other' }]
    expect((await t.p.deploy({ path: '/p' })).text).toBe('Your Free plan allows 1 model. A bigger plan lifts it: Upgrade in /ada.')
    t.rrotor.r.models = [{ name: 'daily_sales' }]
    expect((await t.p.deploy({ path: '/p' })).ok).toBe(true)
  })

  test("call answers rrotor's Result", async () => {
    const t = ready()
    const r = await t.p.call({ model: 'daily_sales', inputs: { day: '2026-10-14' } })
    expect(JSON.parse(r.text)).toMatchObject({ status: 'needs_approval', step: 'write' })
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ model: 'daily_sales', function: 'start', inputs: { day: '2026-10-14' } })
    await t.p.call({ model: 'daily_sales', function: 'summary', inputs: 'x', version: 2 })
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ model: 'daily_sales', function: 'summary', inputs: {}, version: 2 })
    t.advance(24 * 3600_000)
    expect((await t.p.call({ model: 'daily_sales' })).ok).toBe(true)
    expect((await t.p.call({})).text).toBe('ada_call needs the model.')
  })

  test('continue, status (the last 20 log lines), list; their refusals', async () => {
    const t = ready()
    expect(JSON.parse((await t.p.resume({ run_id: 'r-1', answer: { approved: true } })).text)).toMatchObject({ status: 'done' })
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ answer: { approved: true } })
    await t.p.resume({ run_id: 'r-1' })
    expect(t.rrotor.r.calls.at(-1)!.body).toEqual({ answer: null })
    expect(JSON.parse((await t.p.status({ run_id: 'r-1' })).text).log).toHaveLength(20)
    expect(JSON.parse((await t.p.list()).text)).toEqual({ models: [] })
    expect((await t.p.resume({})).text).toBe('ada_continue needs the run_id.')
    expect((await t.p.status({})).text).toBe('ada_run needs the run_id.')
  })

  test("rrotor down says how to start it; rrotor's own refusals are passed on", async () => {
    const t = ready()
    t.rrotor.r.up = false
    expect((await t.p.list()).text).toBe('rrotor is not answering: connection refused. Run /ada start.')
    expect(await t.p.health()).toBeNull()
    t.rrotor.r.up = true
    t.rrotor.r.answers.set('POST /v1/runs', { status: 404, body: { error: { code: 'E_PROGRAM_MISSING', message: 'This rrotor has no model x.' } } })
    expect((await t.p.call({ model: 'x' })).text).toBe('This rrotor has no model x.')
  })
})

describe('the status line and /models', () => {
  const health = (over: object = {}) => ({
    version: '0.1.0', mode: 'local', runtime_id: 'rt-1', link: { state: 'online', since: 0, last_close: null, owed: 0 },
    sandbox: { ready: true, layers: { landlock: { ok: true, detail: 'ABI 6' }, bubblewrap: { ok: false, detail: 'no namespaces' } } }, approvals: 0, models: 2, parts: [], licence: null, ...over,
  })

  test('stopped, online, waiting for you, the sandbox not ready', () => {
    expect(statusLine(null)).toBe('rrotor ○ stopped')
    expect(statusLine(health())).toBe('rrotor ● online')
    expect(statusLine(health({ approvals: 2, link: { state: 'no_token' }, sandbox: { ready: false, layers: {} } }))).toBe('rrotor ● no token · sandbox not ready · 2 waiting for you')
  })

  test('/ada describes rrotor, its link, its models and each sandbox layer', () => {
    expect(describeHealth(null)).toBe('rrotor is not running. /ada start starts it.')
    expect(describeHealth(health())).toBe('rrotor 0.1.0 · link online · runtime rt-1\nmodels: 2 · waiting for you: 0\nparts: none · licence: none\nsandbox ready:\n  ✓ landlock: ABI 6\n  ✗ bubblewrap: no namespaces')
    expect(describeHealth(health({ runtime_id: null, sandbox: { ready: false, layers: {} } }))).toContain('NOT ready')
  })
})

void fakeRrotor
