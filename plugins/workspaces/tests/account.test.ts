import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'
import { HARDWARE_UUID, INSTALL_PATH, LICENSE_PATH, SERVER, TOKEN } from './glyphh.ts'
import { INSTALL, PRO } from './licences.ts'

const SIGNED_OUT = 'Sign in to Glyphh to use Workspaces: /workspaces signin.'
const NOT_IN_PLAN = 'Workspaces is not in your Free plan. Upgrade in /workspaces.'
const NO_STREAM = 'The live layout page is not in your Free plan. Pro has it: Upgrade in /workspaces.'

/** A session with the layout page's helper running, as after /workspaces. */
async function started($: Engine, on: On, options: WorldOptions = {}) {
  mock.store(on, {})
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  const run = (command: string, args?: string) => runCommand($, command, args)
  await clock.advance(0) // the licence and the plans arrive
  await run('workspaces')
  await clock.advance(1000) // the account's state goes to the page
  return { ...w, clock, run, last: () => w.helper.licence.at(-1) }
}

const pageRead = async ($: Engine) => ((await $.tool.call({ tool: 'mcp__workspaces__page_read', input: {} } as never)) as { result?: unknown }).result

describe('the Glyphh account in Workspaces', () => {
  test('on Pro the page is told the plan and its limits, once while they stay the same, never the token', async ($, on) => {
    const { last, clock, helper, server } = await started($, on)
    expect(last()).toMatchObject({ kind: 'active', plan: 'Pro', gate: null, limits: { workspaces: null, favorites: null, stream: 1 }, refusals: { workspaces: null, favorites: null, stream: null } })
    expect(JSON.stringify(helper.licence)).not.toContain(TOKEN)
    expect(server.asked('/v1/license')[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    const sent = helper.licence.length
    await clock.advance(1000)
    expect(helper.licence).toHaveLength(sent)
  })

  test('signed out: the page shows Sign in; /dip, /stream, the panes and page_read refuse; /workspaces still opens it', async ($, on) => {
    const { last, run } = await started($, on, { account: 'signed-out' })
    expect(last()).toMatchObject({ kind: 'signed-out', plan: null, gate: SIGNED_OUT, about: expect.arrayContaining([expect.stringContaining('Workspaces sets up')]) })
    expect(await run('dip', 'IDE')).toBe(SIGNED_OUT)
    expect(await run('dip')).toBe(SIGNED_OUT)
    expect(await run('stream')).toBe(SIGNED_OUT)
    expect(await run('files')).toBe(SIGNED_OUT)
    expect(await pageRead($)).toEqual({ error: SIGNED_OUT })
    expect(await run('workspaces')).toBe('Workspaces: layout page ✓')
  })

  test('a plan without Workspaces closes it with Upgrade', async ($, on) => {
    const { last, run } = await started($, on, { account: 'none' })
    expect(last()).toMatchObject({ kind: 'not-in-plan', plan: 'Free', gate: NOT_IN_PLAN })
    expect(await run('dip', 'IDE')).toBe(NOT_IN_PLAN)
  })

  test("the page's Sign in: a code for this Mac, its page opened, then signed in for every Glyphh mod", async ($, on) => {
    const { helper, clock, last, server, ran, writes, files, toasts, run } = await started($, on, { account: 'signed-out' })
    helper.press('signin')
    await clock.advance(1000)
    const sent = server.asked('/v1/device/code')[0]!.body as Record<string, unknown>
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(HARDWARE_UUID))), b => b.toString(16).padStart(2, '0')).join('')
    expect(sent).toEqual({ machine_id: hash, name: "Tim's MacBook Pro", surface: 'desktop', mod_version: '0.0.0' })
    expect(JSON.stringify(sent)).not.toContain(HARDWARE_UUID)
    expect(ran).toContainEqual(['open', `${SERVER}/v1/device?code=BCDF-GHJK`])
    expect(last()).toMatchObject({ kind: 'signed-out', signIn: { userCode: 'BCDF-GHJK', uri: `${SERVER}/v1/device` } })

    server.tokens.push({ status: 200, body: { access_token: TOKEN, token_type: 'Bearer', install_id: INSTALL } })
    for (let i = 0; i < 6 && last()?.kind !== 'active'; i++) await clock.advance(1000)
    expect(last()).toMatchObject({ kind: 'active', plan: 'Pro', signIn: null })
    expect(toasts).toContain('Signed in to Glyphh: Pro plan.')
    // install.json: written owner-only and whole, the token on stdin, never in an argument.
    const write = writes.find(x => x.argv[5] === INSTALL_PATH)!
    expect(write.argv.slice(0, 2)).toEqual(['/bin/sh', '-c'])
    expect(write.argv[2]).toStartWith('umask 077 && ')
    expect(write.argv[2]).toContain('mv -f')
    expect(JSON.stringify(write.argv)).not.toContain(TOKEN)
    expect(JSON.parse(write.stdin)).toEqual({ server: SERVER, install_id: INSTALL, token: TOKEN })
    expect(files.get(LICENSE_PATH)).toContain(PRO)
    expect(await run('dip', 'IDE')).toStartWith('→ IDE')
  })

  test('/workspaces signin and signout', async ($, on) => {
    const { run, files, server } = await started($, on)
    expect(await run('workspaces', 'signin')).toBe('Signed in to Glyphh (Pro plan).')
    expect(await run('workspaces', 'signout')).toBe('Signed out of Glyphh on this Mac.')
    expect(server.asked('/v1/sign-out')).toHaveLength(1)
    expect(files.has(INSTALL_PATH)).toBe(false)
    expect(files.has(LICENSE_PATH)).toBe(false)
    expect(await run('dip', 'IDE')).toBe(SIGNED_OUT)
    expect(await run('workspaces', 'signout x')).toBe('Usage: /workspaces signout')
  })

  test('Free without the live layout page: /stream and page_read refuse naming it; /dip switches the panes only', async ($, on) => {
    const { run, last, helper } = await started($, on, { account: 'free' })
    expect(last()).toMatchObject({ kind: 'active', plan: 'Free', limits: { workspaces: 1, favorites: 2, stream: 0 }, refusals: { stream: NO_STREAM } })
    expect(await run('stream')).toBe(NO_STREAM)
    expect(await pageRead($)).toEqual({ error: NO_STREAM })
    expect(await run('dip', 'Comms')).toBe(`→ Comms  Browser ✓ · ${NO_STREAM}`)
    expect(helper.layouts.at(-1)?.layouts.flatMap(l => l.cells).some(c => c.page !== undefined)).toBe(false)
    expect(helper.layouts.at(-1)?.library.workspaces.length).toBeGreaterThan(0)
  })

  test("the page's Upgrade at a limit opens checkout for the plan that lifts it; Manage billing opens Stripe's page", async ($, on) => {
    const { helper, clock, server, ran, last } = await started($, on, { account: 'free' })
    helper.press('upgrade:stream')
    await clock.advance(1000)
    expect(server.asked('/v1/billing/checkout')[0]!.body).toEqual({ plan: 'Pro', seats: 1 })
    expect(ran).toContainEqual(['open', 'https://checkout.stripe.com/c/pay/cs_test_1'])
    expect(last()).toMatchObject({ isUpgrading: true })
    server.licence = PRO
    for (let i = 0; i < 10 && last()?.plan !== 'Pro'; i++) await clock.advance(1000)
    expect(last()).toMatchObject({ plan: 'Pro', isUpgrading: false, limits: { stream: 1 } })
    helper.press('billing')
    await clock.advance(1000)
    expect(ran).toContainEqual(['open', 'https://billing.stripe.com/p/session/test_1'])
  })

  test("the page's Cancel ends a sign-in; an unknown ask is passed over", async ($, on) => {
    const { helper, clock, last } = await started($, on, { account: 'signed-out' })
    helper.press('signin')
    await clock.advance(1000)
    helper.press('cancel')
    helper.press('buy')
    await clock.advance(1000)
    expect(last()).toMatchObject({ signIn: null, note: null })
  })

  test('a helper that goes away is sent everything again once one is back', async ($, on) => {
    const { clock, helper, run } = await started($, on)
    const sent = helper.licence.length
    helper.alive = null
    await clock.advance(1000)
    await clock.advance(1000)
    await run('workspaces')
    await clock.advance(1000)
    expect(helper.licence.length).toBeGreaterThan(sent)
  })
})
