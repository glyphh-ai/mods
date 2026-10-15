import { describe, expect, test } from 'claude-code/testing'

import { client, RrotorError } from '../hooks/programs/rrotor.ts'
import { fakeRrotor } from './fakes.ts'

describe("rrotor's local API", () => {
  test('every call carries the local token; JSON goes as JSON', async () => {
    const { r, fetch } = fakeRrotor()
    const c = client(fetch, 47701, 'local-token')
    await c.call({ program: 'p', function: 'start', inputs: {} })
    expect(r.calls[0]).toMatchObject({ url: 'http://127.0.0.1:47701/v1/runs', method: 'POST', headers: { Authorization: 'Bearer local-token', 'Content-Type': 'application/json' } })
    await c.health()
    expect(r.calls[1]!.headers).toEqual({ Authorization: 'Bearer local-token' })
  })

  test("rrotor's refusals keep their code; a non-JSON error and a dead rrotor have their own", async () => {
    const { r, fetch } = fakeRrotor()
    const c = client(fetch, 1, 't')
    r.answers.set('GET /v1/runs/x', { status: 404, body: { error: { code: 'E_RUN_MISSING', message: 'There is no such run.' } } })
    await expect(c.status('x')).rejects.toMatchObject({ code: 'E_RUN_MISSING', status: 404 })
    r.answers.set('GET /v1/approvals', { status: 502, body: 'bad gateway' })
    await expect(c.approvals()).rejects.toMatchObject({ code: 'E_RROTOR', message: 'rrotor answered 502' })
    r.up = false
    await expect(c.programs()).rejects.toBeInstanceOf(RrotorError)
    expect(await c.up()).toBe(false)
  })

  test('every route', async () => {
    const { r, fetch } = fakeRrotor()
    const c = client(fetch, 1, 't')
    expect(await c.up()).toBe(true)
    await c.putToken('rid', 'tok')
    await c.programs()
    await c.deploy({ bundle: 'QUJD', commit: 'c' })
    await c.resume('r 1', { approved: true })
    await c.cancel('r-1')
    await c.log('r-1')
    r.answers.set('GET /v1/approvals', { status: 200, body: { approvals: [1] } })
    expect(await c.approvals()).toEqual([1])
    expect(r.calls.map(x => `${x.method} ${new URL(x.url).pathname}`)).toEqual([
      'GET /healthz', 'PUT /v1/runtime/token', 'GET /v1/programs', 'POST /v1/programs/deploy', 'POST /v1/runs/r%201/continue',
      'POST /v1/runs/r-1/cancel', 'GET /v1/runs/r-1/log', 'GET /v1/approvals',
    ])
  })
})
