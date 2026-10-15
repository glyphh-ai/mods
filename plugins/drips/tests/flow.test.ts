import { describe, expect, test } from 'claude-code/testing'

import { addOn, billing, cancel, confirmAddOn, errorOf, fetchAddons, load, parseAddons, parseInstall, parseLicenceFile, parsePlans, refresh, refreshDue, signIn, signOut, start, stop, tick, upgrade } from '../hooks/licence/flow.ts'
import { access, gateOf, pageStatus } from '../hooks/licence/access.ts'
import { verifyLicence } from '../hooks/licence/verify.ts'
import { fakeDeps, T0 } from './account-fakes.ts'
import { ADDONS, addonOf, INSTALL_PATH, LICENSE_PATH, PLANS, PREVIEW, refusalBody, SERVER, TOKEN, installFile, licenceFile } from './glyphh.ts'
import { ADDON_KEY, FAR, FREE, INSTALL, OTHER_INSTALL, PRO, PRO_ADDED, PRO_BASE } from './licences.ts'

const BEARER = `Bearer ${TOKEN}`
const ADMIN_ONLY = "Only your Glyphh org's admin can change its plan and billing."

/** Each test starts from no timers of an earlier one. */
const fresh = (...args: Parameters<typeof fakeDeps>) => {
  stop()
  return fakeDeps(...args)
}

describe('the shared files in ~/.glyphh', () => {
  test("install.json: this server's install and token; another server's, or junk, is no sign-in", () => {
    expect(parseInstall(installFile())).toEqual({ install_id: INSTALL, token: TOKEN })
    expect(parseInstall(installFile(TOKEN, INSTALL, 'https://api.glyphh.ai'))).toBeNull()
    expect(parseInstall(JSON.stringify({ server: SERVER, install_id: INSTALL }))).toBeNull()
    expect(parseInstall(JSON.stringify({ server: SERVER, install_id: '', token: 'x' }))).toBeNull()
    expect(parseInstall('{')).toBeNull()
    expect(parseInstall(null)).toBeNull()
  })

  test("license.json: when it was fetched and the server's answer as it came", () => {
    const f = parseLicenceFile(licenceFile(PRO, 123))!
    expect(f.fetchedAt).toBe(123)
    expect(parseLicenceFile('{"license":{}}')).toBeNull()
    expect(parseLicenceFile('{"fetched_at":"x","license":{}}')).toBeNull()
    expect(parseLicenceFile('{"fetched_at":1}')).toBeNull()
    expect(parseLicenceFile('nope')).toBeNull()
    expect(parseLicenceFile(null)).toBeNull()
  })

  test('read into the state: the install and a licence that checks out for it', async () => {
    const { d, state } = fresh('free')
    await load(d)
    expect(state().install).toEqual({ install_id: INSTALL, token: TOKEN })
    expect(state().licence?.plan).toBe('Free')
    expect(state().fetchedAt).toBe(T0)
  })

  test('a stored licence for another install, or with a bad signature, is not used; the sign-in stays', async () => {
    const { d, state, files, logs } = fresh('pro')
    files.set(LICENSE_PATH, licenceFile(OTHER_INSTALL, T0))
    await load(d)
    expect(state().install).not.toBeNull()
    expect(state().licence).toBeNull()
    expect(logs).toContain('drips account: the stored licence was not used (install)')
    files.set(LICENSE_PATH, licenceFile(PRO.replace('"plan":"Pro"', '"plan":"Max"'), T0))
    await load(d)
    expect(logs).toContain('drips account: the stored licence was not used (signature)')
  })

  test('without HOME, or without install.json, signed out; a licence alone is not a sign-in', async () => {
    const none = fresh('pro', { home: null })
    await load(none.d)
    expect(access(none.state(), T0)).toEqual({ kind: 'signed-out' })
    const { d, state, files } = fresh('pro')
    files.delete(INSTALL_PATH)
    await load(d)
    expect(state().install).toBeNull()
    expect(state().licence).toBeNull()
  })
})

describe('the licence from the server', () => {
  test('at the start: the files read, the licence asked for with the token, the plans fetched, the files watched', async () => {
    const { d, state, server, pending } = fresh('pro')
    await start(d)
    await refresh(d)
    expect(server.asked('/v1/license')[0]!.headers.Authorization).toBe(BEARER)
    expect(server.asked('/v1/plans')).toHaveLength(1)
    expect(state().plans.map(p => p.name)).toEqual(['Free', 'Pro'])
    expect(state().plans[0]!.mods.drips).toEqual({ custom_drips: 2, fullscreen: 0 })
    expect(pending()).toBe(1)
    expect(JSON.stringify(state().licence)).not.toContain(TOKEN)
  })

  test('a licence that checks out is kept as it came, with when it was fetched, and reads back the same', async () => {
    const { d, state, files, server, w } = fresh('free')
    await load(d)
    server.licence = PRO
    await w.advance(1000)
    await refresh(d)
    expect(files.get(LICENSE_PATH)).toBe(`{"fetched_at":${T0 + 1000},"license":${PRO}}\n`)
    expect(state().licence?.plan).toBe('Pro')
    expect(state().fetchedAt).toBe(T0 + 1000)
    await load(d, true)
    expect(state().licence?.plan).toBe('Pro')
  })

  test("the server's licence that does not check out is not kept, and asked for again a minute later", async () => {
    const { d, state, files, server, logs, w } = fresh('free')
    await load(d)
    server.licence = PRO.replace('"plan":"Pro"', '"plan":"Max"')
    await refresh(d)
    expect(state().licence?.plan).toBe('Free')
    expect(files.get(LICENSE_PATH)).toContain('"plan":"Free"')
    expect(logs).toContain("drips account: the server's licence was not used (signature)")
    server.licence = 'garbage'
    await refresh(d)
    expect(logs).toContain("drips account: the server's licence was not JSON")
  })

  test('a token the server no longer knows signs this machine out: the files go', async () => {
    const { d, state, files } = fresh('pro')
    files.set(INSTALL_PATH, installFile('revoked'))
    await load(d)
    await refresh(d)
    expect(files.has(INSTALL_PATH)).toBe(false)
    expect(files.has(LICENSE_PATH)).toBe(false)
    expect(state()).toMatchObject({ install: null, licence: null, note: 'Your Glyphh sign-in has ended. Sign in again.' })
  })

  test('offline, the licence held keeps working; the next try is a minute later, not every few seconds', async () => {
    const { d, state, server, w } = fresh('pro', { fetchedAt: T0 - 200 * 86_400_000 })
    server.offline = true
    await start(d)
    await refresh(d)
    expect(state().licence?.plan).toBe('Pro')
    server.offline = false
    await w.advance(30_000)
    expect(server.asked('/v1/license')).toHaveLength(0)
    await w.advance(35_000)
    expect(server.asked('/v1/license')).toHaveLength(1)
    expect(state().fetchedAt).toBe(T0 + 60_000)
  })

  test('refreshed at half its life: not before', async () => {
    const { d, state, server, w } = fresh('pro')
    await load(d)
    const due = refreshDue(state())
    expect(due).toBe(T0 + (FAR - T0) / 2)
    await tick(d)
    expect(server.asked('/v1/license')).toHaveLength(0)
    await w.advance(due - T0)
    await tick(d)
    expect(server.asked('/v1/license')).toHaveLength(1)
    expect(refreshDue({ ...state(), licence: null })).toBe(0)
  })

  test("another mod's sign-out or sign-in shows here within the watch's few seconds", async () => {
    const { d, state, files, w } = fresh('pro')
    await start(d)
    await refresh(d)
    files.delete(INSTALL_PATH)
    files.delete(LICENSE_PATH)
    await w.advance(5000)
    expect(state().install).toBeNull()
    files.set(INSTALL_PATH, installFile())
    files.set(LICENSE_PATH, licenceFile(FREE, T0))
    await w.advance(5000)
    expect(state().licence?.plan).toBe('Free')
  })

  test('the plans: the server\'s map of limits, or its list of slugs (included, limits unknown); junk is none', () => {
    expect(parsePlans(PLANS)[1]).toEqual({ name: 'Pro', price: 900, mods: { workspaces: { workspaces: null, favorites: null, stream: 1 }, drips: { custom_drips: null, fullscreen: 1 } } })
    expect(parsePlans(JSON.stringify([{ name: 'Free', mods: ['drips', 3] }, { nope: 1 }, null]))).toEqual([{ name: 'Free', mods: { drips: {} } }])
    expect(parsePlans(JSON.stringify([{ name: 'Free' }]))).toEqual([{ name: 'Free', mods: {} }])
    expect(parsePlans('{}')).toEqual([])
  })

  test("the server's refusals read as code and message; anything else as its status", () => {
    expect(errorOf({ status: 409, ok: false, text: JSON.stringify(refusalBody('E_CONFLICT', 'Taken.', { used: 3 })) })).toMatchObject({ code: 'E_CONFLICT', message: 'Taken.', detail: { used: 3 } })
    expect(errorOf({ status: 502, ok: false, text: '<html>' })).toEqual({ code: 'HTTP_502', message: 'The Glyphh server answered 502.', detail: {} })
    expect(errorOf({ status: 400, ok: false, text: '{"error":{"code":"x"}}' }).message).toBe('x')
  })
})

describe('signing in to Glyphh (the device flow)', () => {
  test('a code for this machine, its page opened, the server asked at its interval until the token comes', async () => {
    const { d, state, files, server, opened, browsed, toasts, w } = fresh('signed-out')
    await start(d)
    expect(await signIn(d)).toBe('Sign in to Glyphh: check the code BCDF-GHJK at http://localhost:8080/v1/device (opened in the browser pane).')
    expect(server.asked('/v1/device/code')[0]!.body).toEqual({ machine_id: 'a'.repeat(64), name: 'Test Mac', surface: 'desktop', mod_version: '1.0.0' })
    expect(browsed).toEqual(['http://localhost:8080/v1/device?code=BCDF-GHJK'])
    expect(opened).toEqual([])
    expect(state().signIn).toEqual({ userCode: 'BCDF-GHJK', uri: 'http://localhost:8080/v1/device' })
    expect(await signIn(d)).toBe('Signing in: check the code BCDF-GHJK at http://localhost:8080/v1/device')
    await w.advance(4999)
    expect(server.asked('/v1/device/token')).toHaveLength(0)
    await w.advance(1)
    expect(server.asked('/v1/device/token')[0]!.body).toEqual({ device_code: 'dev-code-1' })
    server.tokens.push({ status: 200, body: { access_token: TOKEN, token_type: 'Bearer', install_id: INSTALL } })
    await w.advance(5000)
    expect(JSON.parse(files.get(INSTALL_PATH)!)).toEqual({ server: SERVER, install_id: INSTALL, token: TOKEN })
    expect(state()).toMatchObject({ signIn: null, install: { install_id: INSTALL }, licence: { plan: 'Pro' } })
    expect(toasts).toContain('Signed in to Glyphh: Pro plan.')
    expect(await signIn(d)).toBe('Signed in to Glyphh (Pro plan).')
  })

  test('slow_down: the interval grows by 5 seconds', async () => {
    const { d, server, w } = fresh('signed-out')
    await signIn(d)
    server.tokens.push({ status: 400, body: refusalBody('slow_down', 'Polling too fast: wait 10 seconds between polls.') })
    await w.advance(5000)
    expect(server.asked('/v1/device/token')).toHaveLength(1)
    await w.advance(9999)
    expect(server.asked('/v1/device/token')).toHaveLength(1)
    await w.advance(1)
    expect(server.asked('/v1/device/token')).toHaveLength(2)
  })

  test('expired_token, or the code running out on the clock, ends it and says so', async () => {
    const a = fresh('signed-out')
    await signIn(a.d)
    a.server.tokens.push({ status: 400, body: refusalBody('expired_token', 'This sign-in has expired. Start again in Claude.') })
    await a.w.advance(5000)
    expect(a.state()).toMatchObject({ signIn: null, note: 'The sign-in code expired. Sign in again.' })
    expect(a.pending()).toBe(0)

    const b = fresh('signed-out')
    b.server.deviceCode = { status: 200, body: { ...(b.server.deviceCode.body as object), expires_in: 12 } }
    await signIn(b.d)
    await b.w.advance(15_000)
    expect(b.state()).toMatchObject({ signIn: null, note: 'The sign-in code expired. Sign in again.' })
  })

  test('access_denied ends it and says so', async () => {
    const { d, state, server, w } = fresh('signed-out')
    await signIn(d)
    server.tokens.push({ status: 400, body: refusalBody('access_denied', 'The sign-in was denied.') })
    await w.advance(5000)
    expect(state()).toMatchObject({ signIn: null, note: 'The sign-in was declined.' })
  })

  test('offline between polls, it keeps asking', async () => {
    const { d, server, w } = fresh('signed-out')
    await signIn(d)
    server.offline = true
    await w.advance(5000)
    server.offline = false
    await w.advance(5000)
    expect(server.asked('/v1/device/token')).toHaveLength(1)
  })

  test('Cancel stops asking; a token arriving after is not taken', async () => {
    const { d, state, server, w } = fresh('signed-out')
    await signIn(d)
    await cancel(d)
    expect(state().signIn).toBeNull()
    server.tokens.push({ status: 200, body: { access_token: TOKEN, install_id: INSTALL } })
    await w.advance(20_000)
    expect(server.asked('/v1/device/token')).toHaveLength(0)
    expect(state().install).toBeNull()
  })

  test("the desktop app refusing the Browser pane: Claude is asked to open the page there, never the Mac's browser", async () => {
    const { d, w, opened, asked } = fresh('signed-out')
    w.browseOk = false
    expect(await signIn(d)).toBe('Sign in to Glyphh: check the code BCDF-GHJK at http://localhost:8080/v1/device (Claude is asked to open it in the browser pane).')
    expect(asked).toEqual(['Open this page in the browser pane: http://localhost:8080/v1/device?code=BCDF-GHJK'])
    expect(opened).toEqual([])
    expect(asked.join()).not.toContain(TOKEN)
  })

  test('in a terminal the link is printed and copied, and the browser opened; where it cannot be copied, it is said', async () => {
    const a = fresh('signed-out')
    a.w.desktop = false
    expect(await signIn(a.d)).toBe('Sign in to Glyphh: check the code BCDF-GHJK at http://localhost:8080/v1/device (link copied: http://localhost:8080/v1/device?code=BCDF-GHJK).')
    expect(a.copied).toEqual(['http://localhost:8080/v1/device?code=BCDF-GHJK'])
    expect(a.opened).toEqual(['http://localhost:8080/v1/device?code=BCDF-GHJK'])
    expect(a.browsed).toEqual([])
    expect(a.toasts).toContain('The sign-in link is copied: http://localhost:8080/v1/device?code=BCDF-GHJK')
    const b = fresh('signed-out')
    b.w.desktop = false
    b.w.openOk = false
    b.w.copyOk = false
    expect(await signIn(b.d)).toContain('(open http://localhost:8080/v1/device?code=BCDF-GHJK)')
    expect(b.toasts).toContain('Open this link: http://localhost:8080/v1/device?code=BCDF-GHJK')
  })

  test('the server refusing the code, or unreachable, is said', async () => {
    const a = fresh('signed-out')
    a.server.deviceCode = { status: 422, body: refusalBody('E_INVALID', 'The request is not valid.') }
    expect(await signIn(a.d)).toBe('Could not start signing in: The request is not valid.')
    const b = fresh('signed-out')
    b.server.offline = true
    expect(await signIn(b.d)).toBe('Could not reach Glyphh to sign in. Check your connection and try again.')
    expect(b.state().note).toBe('Could not reach Glyphh to sign in. Check your connection and try again.')
  })

  test('a token answer without the token ends it', async () => {
    const { d, state, server, w } = fresh('signed-out')
    await signIn(d)
    server.tokens.push({ status: 200, body: { token_type: 'Bearer' } })
    await w.advance(5000)
    expect(state()).toMatchObject({ signIn: null, install: null, note: 'The sign-in did not finish. Sign in again.' })
  })

  test('signed in with an expired licence: Sign in again asks for the licence first', async () => {
    const { d, server } = fresh('pro-expired')
    await load(d)
    server.licence = PRO
    expect(await signIn(d)).toBe('Signed in to Glyphh (Pro plan).')
    expect(server.asked('/v1/device/code')).toHaveLength(0)
  })
})

describe('signing out', () => {
  test('the server forgets the token; the shared files go, for every Glyphh mod', async () => {
    const { d, state, files, server } = fresh('pro')
    await load(d)
    expect(await signOut(d)).toBe('Signed out of Glyphh on this Mac.')
    expect(server.asked('/v1/sign-out')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER } })
    expect(files.size).toBe(0)
    expect(access(state(), T0)).toEqual({ kind: 'signed-out' })
  })

  test('offline, signed out here all the same; not signed in, it says so', async () => {
    const { d, files, server } = fresh('pro')
    await load(d)
    server.offline = true
    expect(await signOut(d)).toBe('Signed out of Glyphh on this Mac.')
    expect(files.size).toBe(0)
    expect(await signOut(d)).toBe('Not signed in to Glyphh.')
  })
})

describe('Upgrade and Manage billing', () => {
  test("Upgrade: checkout for the next plan, opened; the licence asked until the plan changes", async () => {
    const { d, state, server, browsed, toasts, w } = fresh('free')
    await load(d)
    expect(await upgrade(d)).toBe('Finish checkout (opened in the browser pane): Drips updates on its own.')
    expect(server.asked('/v1/plans')).toHaveLength(1)
    expect(server.asked('/v1/billing/checkout')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER }, body: { plan: 'Pro', seats: 1 } })
    expect(browsed).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1'])
    expect(state().upgrading).toEqual({ plan: 'Free' })
    server.licence = FREE
    await w.advance(5000)
    expect(state().upgrading).not.toBeNull()
    server.licence = PRO
    await w.advance(5000)
    expect(state()).toMatchObject({ upgrading: null, licence: { plan: 'Pro' } })
    expect(toasts).toContain('Glyphh: you are on the Pro plan now.')
  })

  test('Upgrade at a limit goes to the plan that lifts it', async () => {
    const { d, server } = fresh('free')
    await load(d)
    await upgrade(d, 'fullscreen')
    expect(server.asked('/v1/billing/checkout')[0]!.body).toEqual({ plan: 'Pro', seats: 1 })
  })

  test('no plan change in 15 minutes: the wait ends and says so', async () => {
    const { d, state, w } = fresh('free')
    await load(d)
    await upgrade(d)
    await w.advance(15 * 60_000)
    expect(state()).toMatchObject({ upgrading: null, note: 'No plan change seen yet. Your plan updates here once checkout finishes.' })
  })

  test("checkout counts the org's seats: a refusal naming them is asked again with that many", async () => {
    const { d, server } = fresh('free')
    await load(d)
    server.checkout.push({ status: 409, body: refusalBody('E_CONFLICT', '3 seats are taken by members and open invites.', { used: 3, seats: 1 }) })
    await upgrade(d)
    expect(server.asked('/v1/billing/checkout').map(r => (r.body as { seats: number }).seats)).toEqual([1, 3])
  })

  test('an org already subscribed changes plan in the billing page', async () => {
    const { d, browsed, state, server } = fresh('free')
    await load(d)
    server.checkout.push({ status: 409, body: refusalBody('E_CONFLICT', 'Your org is already subscribed: change plan or seats instead.', { reason: 'subscribed' }) })
    expect(await upgrade(d)).toBe('Change to Pro in the billing page (opened in the browser pane): Drips updates on its own.')
    expect(browsed).toEqual(['https://billing.stripe.com/p/session/test_1'])
    expect(state().upgrading).toEqual({ plan: 'Free' })
  })

  test("only the org's admin may: said; other refusals say the server's words", async () => {
    const { d, server, state } = fresh('free')
    await load(d)
    server.checkout.push({ status: 403, body: refusalBody('E_FORBIDDEN', 'Admins only.') })
    expect(await upgrade(d)).toBe(ADMIN_ONLY)
    expect(state().note).toBe(ADMIN_ONLY)
    server.checkout.push({ status: 400, body: refusalBody('E_INVALID', "Pro isn't sold through Stripe.") })
    expect(await upgrade(d)).toBe("Pro isn't sold through Stripe.")
    server.offline = true
    expect(await upgrade(d)).toBe('Could not reach Glyphh. Check your connection and try again.')
  })

  test('on the top plan there is nothing to upgrade to; signed out, Upgrade signs in first', async () => {
    const pro = fresh('pro')
    await load(pro.d)
    expect(await upgrade(pro.d)).toBe('There is no plan above Pro to upgrade to.')
    const out = fresh('signed-out')
    expect(await upgrade(out.d)).toContain('Sign in to Glyphh: check the code BCDF-GHJK')
  })

  test("Manage billing opens Stripe's page; no billing yet, or not the admin, is said", async () => {
    const { d, server, browsed, opened } = fresh('pro')
    await load(d)
    expect(await billing(d)).toBe('Billing: opened in the browser pane.')
    expect(server.asked('/v1/billing/portal')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER } })
    expect(browsed).toEqual(['https://billing.stripe.com/p/session/test_1'])
    expect(opened).toEqual([])
    server.portal = { status: 409, body: refusalBody('E_CONFLICT', 'Your org has no billing yet: subscribe first.', { reason: 'no_billing' }) }
    expect(await billing(d)).toBe('No billing yet: Upgrade to a paid plan first.')
    server.portal = { status: 403, body: refusalBody('E_FORBIDDEN', 'Admins only.') }
    expect(await billing(d)).toBe(ADMIN_ONLY)
    server.portal = { status: 200, body: { url: 'javascript:alert(1)' } }
    expect(await billing(d)).toBe('The Glyphh server answered 200.')
    server.offline = true
    expect(await billing(d)).toBe('Could not reach Glyphh. Check your connection and try again.')
    expect(await billing(fresh('signed-out').d)).toBe('Sign in to Glyphh first.')
  })

  test('in a terminal, checkout and billing are printed and copied; refused on the desktop, Claude is asked', async () => {
    const t = fresh('free')
    t.w.desktop = false
    await load(t.d)
    expect(await upgrade(t.d)).toBe('Finish checkout (link copied: https://checkout.stripe.com/c/pay/cs_test_1): Drips updates on its own.')
    expect(t.copied).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1'])
    const b = fresh('pro')
    b.w.desktop = false
    await load(b.d)
    expect(await billing(b.d)).toBe('Billing: link copied: https://billing.stripe.com/p/session/test_1.')
    const r = fresh('pro')
    r.w.browseOk = false
    await load(r.d)
    expect(await billing(r.d)).toBe('Billing: Claude is asked to open it in the browser pane.')
    expect(r.asked).toEqual(['Open this page in the browser pane: https://billing.stripe.com/p/session/test_1'])
    expect(r.opened).toEqual([])
  })
})

describe('Drips as an add-on (the plans include Workspaces alone)', () => {
  const ADMIN_ADDS = "Only your Glyphh org's admin can add mods."
  const OFFER = 'Drips is an add-on ($2/month per seat on Pro).'

  /** A subscribed Pro org without Drips: its licence signed with the test key. */
  const subscribed = async () => {
    const t = fresh('pro')
    t.d.verify = (licence, installId) => verifyLicence(licence, installId, ADDON_KEY)
    t.files.set(LICENSE_PATH, licenceFile(PRO_BASE, T0))
    t.server.licence = PRO_BASE
    t.server.addons = { status: 200, body: [addonOf('drips', { allowed: true }), addonOf('programs', { allowed: true })] }
    t.server.previews.push({ status: 200, body: PREVIEW })
    await load(t.d)
    await fetchAddons(t.d)
    return t
  }

  test('the catalog: what the org may add and has; junk is none; signed out or refused, nothing asked or kept', async () => {
    expect(parseAddons(JSON.stringify(ADDONS))).toEqual([
      { mod: 'drips', name: 'Drips', price_cents: 200, per_seat: true, plans: ['Pro', 'Team'], free: false, allowed: false, added: false },
      { mod: 'programs', name: 'Programs', price_cents: 400, per_seat: true, plans: ['Pro', 'Team'], free: false, allowed: false, added: false },
    ])
    expect(parseAddons(JSON.stringify([{ mod: 'x', price_cents: 100, plans: ['Pro', 3], per_seat: false, free: true }, { mod: 'y' }, null]))).toEqual([
      { mod: 'x', name: 'x', price_cents: 100, per_seat: false, plans: ['Pro'], free: true, allowed: false, added: false },
    ])
    expect(parseAddons('{}')).toEqual([])
    const out = fresh('signed-out')
    await fetchAddons(out.d)
    expect(out.server.asked('/v1/addons')).toHaveLength(0)
    const { d, state, server, logs } = fresh('none')
    await load(d)
    server.addons = { status: 500, body: 'no' }
    await fetchAddons(d)
    expect(state().addons).toEqual([])
    server.addons = { status: 200, body: 'not json' }
    await fetchAddons(d)
    expect(logs.some(l => l.startsWith('drips account: add-ons:'))).toBe(true)
  })

  test('at the start the catalog is fetched with the token; not in the plan, Drips refuses with the offer pointing at /drips', async () => {
    const { d, state, server } = fresh('none')
    await start(d)
    await refresh(d)
    await fetchAddons(d)
    expect(server.asked('/v1/addons')[0]!.headers.Authorization).toBe(BEARER)
    expect(gateOf(state(), T0)).toBe(`${OFFER} Add it in /drips.`)
    expect(pageStatus(state(), T0)).toMatchObject({ kind: 'not-in-plan', offer: OFFER, quote: null, gate: `${OFFER} Add it in /drips.` })
  })

  test('Free, not subscribed: checkout for the cheapest plan that allows it with the add-on, the org\'s seats; the licence asked until Drips is in it', async () => {
    const { d, state, server, browsed, toasts, w } = fresh('none')
    server.org = { seats: 2, seats_taken: 1 }
    await load(d)
    expect(await addOn(d)).toBe('Finish checkout (opened in the browser pane): Drips updates on its own.')
    expect(server.asked('/v1/billing/addons/preview')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER }, body: { mod: 'drips', action: 'add' } })
    expect(server.asked('/v1/billing/checkout')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER }, body: { plan: 'Pro', seats: 2, addons: ['drips'] } })
    expect(browsed).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1'])
    expect(state().upgrading).toEqual({ plan: 'Free', mod: 'drips' })
    expect(pageStatus(state(), T0).isUpgrading).toBe(true)
    await w.advance(5000)
    expect(state().upgrading).not.toBeNull()
    server.licence = PRO
    server.addons = { status: 200, body: [addonOf('drips', { allowed: true, added: true }), addonOf('programs', { allowed: true })] }
    await w.advance(5000)
    expect(state()).toMatchObject({ upgrading: null, note: null, licence: { plan: 'Pro' } })
    expect(state().addons[0]!.added).toBe(true)
    expect(toasts).toContain('Glyphh: Drips is in your Pro plan now.')
    expect(gateOf(state(), T0)).toBeNull()
  })

  test("the page's Upgrade, not in the plan, is the add-on too; checkout's wait for Drips ends after 15 minutes and says so", async () => {
    const { d, state, server, w } = fresh('none')
    await load(d)
    expect(await upgrade(d)).toBe('Finish checkout (opened in the browser pane): Drips updates on its own.')
    expect(server.asked('/v1/billing/checkout')[0]!.body).toEqual({ plan: 'Pro', seats: 1, addons: ['drips'] })
    await w.advance(15 * 60_000)
    expect(state()).toMatchObject({ upgrading: null, note: 'Drips is not in your plan yet. It opens here once checkout finishes.' })
  })

  test('checkout for the add-on: not the admin, or refused, is said; seats raised to those taken', async () => {
    const { d, server } = fresh('none')
    server.org = { seats: 1, seats_taken: 3 }
    await load(d)
    server.checkout.push({ status: 403, body: refusalBody('E_FORBIDDEN', 'Admins only.') })
    expect(await addOn(d)).toBe(ADMIN_ADDS)
    expect(server.asked('/v1/billing/checkout')[0]!.body).toEqual({ plan: 'Pro', seats: 3, addons: ['drips'] })
    server.checkout.push({ status: 409, body: refusalBody('E_CONFLICT', 'Your org is already subscribed: change plan or seats instead.', { reason: 'subscribed' }) })
    expect(await addOn(d)).toBe('Your org is already subscribed: change plan or seats instead.')
    server.addons = { status: 200, body: [addonOf('drips', { plans: [] })] }
    expect(await addOn(d)).toBe('Drips is not sold with any plan yet.')
  })

  test('subscribed: the prorated price and the month shown to confirm; Confirm adds it at that price, the licence refreshed', async () => {
    const { d, state, server, toasts } = await subscribed()
    expect(gateOf(state(), T0)).toBe(`${OFFER} Add it in /drips.`)
    expect(await addOn(d)).toBe('Add Drips: $0.87 now (prorated), then $2/month. Confirm in /drips, or /drips add confirm.')
    expect(server.asked('/v1/billing/checkout')).toHaveLength(0)
    expect(state().quote).toEqual({ mod: 'drips', proratedCents: 87, monthlyCents: 200, currency: 'usd', prorationDate: PREVIEW.proration_date })
    expect(pageStatus(state(), T0)).toMatchObject({ offer: OFFER, quote: 'Add Drips: $0.87 now (prorated), then $2/month.' })
    server.licence = PRO_ADDED
    expect(await confirmAddOn(d)).toBe('Drips is added: $2/month on your plan.')
    expect(server.asked('/v1/billing/addons')[0]).toMatchObject({ method: 'POST', headers: { Authorization: BEARER }, body: { mod: 'drips', proration_date: PREVIEW.proration_date } })
    expect(state()).toMatchObject({ quote: null, licence: { plan: 'Pro', mods: { drips: { limits: { custom_drips: null } } } } })
    expect(toasts).toContain('Glyphh: Drips is added.')
    expect(gateOf(state(), T0)).toBeNull()
    expect(await addOn(d)).toBe('Drips is in your Pro plan already.')
  })

  test('added, but the licence not updated yet: it is asked for until Drips is in it', async () => {
    const { d, state, server, toasts, w } = await subscribed()
    await addOn(d)
    expect(await confirmAddOn(d)).toBe('Drips is added: it opens here once your licence updates.')
    expect(state().upgrading).toEqual({ plan: 'Pro', mod: 'drips' })
    server.licence = PRO_ADDED
    await w.advance(5000)
    expect(state().upgrading).toBeNull()
    expect(toasts).toContain('Glyphh: Drips is in your Pro plan now.')
  })

  test("not the org's admin: only the admin can add mods, at the preview or at Confirm", async () => {
    const a = fresh('none')
    await load(a.d)
    a.server.previews.push({ status: 403, body: refusalBody('E_FORBIDDEN', "Only your org's admin can do that.", { role: 'member' }) })
    expect(await addOn(a.d)).toBe(ADMIN_ADDS)
    expect(a.state().note).toBe(ADMIN_ADDS)
    expect(a.server.asked('/v1/billing/checkout')).toHaveLength(0)
    const b = await subscribed()
    await addOn(b.d)
    b.server.adds.push({ status: 403, body: refusalBody('E_FORBIDDEN', "Only your org's admin can do that.") })
    expect(await confirmAddOn(b.d)).toBe(ADMIN_ADDS)
    expect(b.state().quote).toBeNull()
  })

  test('the preview refused: not_on_plan names the plan to change to; already_added asks for the licence again', async () => {
    const t = await subscribed()
    t.server.previews.length = 0
    t.server.previews.push({ status: 409, body: refusalBody('E_CONFLICT', "Drips isn't sold with Pro.", { reason: 'not_on_plan', mod: 'drips', plan: 'Pro' }) })
    expect(await addOn(t.d)).toBe("Drips isn't sold with your Pro plan. Change to Pro in Manage billing, then add it.")
    t.server.previews.push({ status: 409, body: refusalBody('E_CONFLICT', 'Your org has the Drips add-on already.', { reason: 'already_added', mod: 'drips' }) })
    expect(await addOn(t.d)).toBe('Your org has Drips already: it opens here once your licence updates.')
    expect(t.server.asked('/v1/license').length).toBeGreaterThan(0)
    t.server.previews.push({ status: 409, body: refusalBody('E_CONFLICT', 'Your org has the Drips add-on already.', { reason: 'already_added', mod: 'drips' }) })
    t.server.licence = PRO_ADDED
    expect(await addOn(t.d)).toBe('Your org has Drips already.')
    expect(await addOn(t.d)).toBe('Drips is in your Pro plan already.')
    const u = await subscribed()
    u.server.previews.length = 0
    u.server.previews.push({ status: 409, body: refusalBody('E_CONFLICT', 'x', { reason: 'not_on_plan' }) })
    u.server.plans = JSON.stringify([{ name: 'Free', mods: {} }])
    u.d.state.set(s => ({ ...s, plans: [] }))
    expect(await addOn(u.d)).toBe("Drips isn't sold with your Pro plan. Change to Pro in Manage billing, then add it.")
  })

  test('Confirm refused: already_added refreshes; another refusal says the server\'s words; offline keeps the price', async () => {
    const t = await subscribed()
    await addOn(t.d)
    t.server.offline = true
    expect(await confirmAddOn(t.d)).toBe('Could not reach Glyphh. Check your connection and try again.')
    expect(t.state().quote).not.toBeNull()
    t.server.offline = false
    t.server.adds.push({ status: 409, body: refusalBody('E_CONFLICT', 'Your org has the Drips add-on already.', { reason: 'already_added' }) })
    t.server.licence = PRO_ADDED
    expect(await confirmAddOn(t.d)).toBe('Your org has Drips already.')
    const u = await subscribed()
    await addOn(u.d)
    u.server.adds.push({ status: 409, body: refusalBody('E_CONFLICT', "Your org isn't subscribed: start with checkout.", { reason: 'not_subscribed' }) })
    expect(await confirmAddOn(u.d)).toBe("Your org isn't subscribed: start with checkout.")
  })

  test('nothing to confirm, Cancel, signed out, offline, a bad preview, another refusal', async () => {
    const t = await subscribed()
    expect(await confirmAddOn(t.d)).toBe('Nothing to confirm: add Drips in /drips first.')
    await addOn(t.d)
    await cancel(t.d)
    expect(t.state().quote).toBeNull()
    expect(pageStatus(t.state(), T0).quote).toBeNull()
    t.server.previews.push({ status: 200, body: { mod: 'drips', prorated_cents: 'x' } })
    expect(await addOn(t.d)).toBe('The Glyphh server answered 200.')
    t.server.previews.push({ status: 422, body: refusalBody('E_INVALID', 'No add-on on sale.', { reason: 'no_addon' }) })
    expect(await addOn(t.d)).toBe('No add-on on sale.')
    t.server.offline = true
    expect(await addOn(t.d)).toBe('Could not reach Glyphh. Check your connection and try again.')
    expect(await addOn(fresh('signed-out').d)).toContain('Sign in to Glyphh: check the code BCDF-GHJK')
    expect(await confirmAddOn(fresh('signed-out').d)).toContain('Sign in to Glyphh: check the code BCDF-GHJK')
  })

  test('a credit or nothing now reads so; another currency by its code', async () => {
    const t = await subscribed()
    t.server.previews.length = 0
    t.server.previews.push({ status: 200, body: { ...PREVIEW, prorated_cents: 0 } }, { status: 200, body: { ...PREVIEW, prorated_cents: -150, currency: 'eur', monthly_cents: 250 } })
    expect(await addOn(t.d)).toBe('Add Drips: nothing now, then $2/month. Confirm in /drips, or /drips add confirm.')
    expect(await addOn(t.d)).toBe('Add Drips: a 1.50 EUR credit now, then 2.50 EUR/month. Confirm in /drips, or /drips add confirm.')
  })

  test('not sold as an add-on (no catalog entry): Upgrade goes to the plan that has it, as before', async () => {
    const { d, server } = fresh('none')
    server.addons = { status: 200, body: [addonOf('programs')] }
    await load(d)
    expect(await addOn(d)).toBe('Finish checkout (opened in the browser pane): Drips updates on its own.')
    expect(server.asked('/v1/billing/addons/preview')).toHaveLength(0)
    expect(server.asked('/v1/billing/checkout')[0]!.body).toEqual({ plan: 'Pro', seats: 1 })
  })
})
