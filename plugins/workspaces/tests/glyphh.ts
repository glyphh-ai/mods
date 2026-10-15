// The Glyphh account beneath the mod, in memory: ~/.glyphh's install.json and
// license.json, this Mac (ioreg, scutil), and the Glyphh server's device flow,
// licence, plans, add-ons, billing and sign-out, answering as the server does.
import type { ProcessRunResult } from 'claude-code'

import { FREE, FREE_EXPIRED, INSTALL, NONE, PRO, PRO_EXPIRED } from './licences.ts'

export const SERVER = 'http://localhost:8080'
export const HOME_DIR = '/home/t'
export const INSTALL_PATH = `${HOME_DIR}/.glyphh/install.json`
export const LICENSE_PATH = `${HOME_DIR}/.glyphh/license.json`
export const TOKEN = 'tok-test-1'
export const HARDWARE_UUID = '9A8B7C6D-1234-5678-9ABC-DEF012345678'

export const installFile = (token = TOKEN, install = INSTALL, server = SERVER) => JSON.stringify({ server, install_id: install, token })
export const licenceFile = (licence: string, fetchedAt: number) => `{"fetched_at":${fetchedAt},"license":${licence}}\n`

/** Who the person is when the session starts. */
export type Account = 'pro' | 'free' | 'none' | 'signed-out' | 'free-expired' | 'pro-expired'
export const LICENCE_OF: Record<Exclude<Account, 'signed-out'>, string> = { pro: PRO, free: FREE, none: NONE, 'free-expired': FREE_EXPIRED, 'pro-expired': PRO_EXPIRED }

export function seedAccount(files: Map<string, string>, account: Account, fetchedAt: number): void {
  if (account === 'signed-out') return
  files.set(INSTALL_PATH, installFile())
  files.set(LICENSE_PATH, licenceFile(LICENCE_OF[account], fetchedAt))
}

/** The server's plans, in its order, with each mod's limits. */
export const PLANS = JSON.stringify([
  { name: 'Free', version: 1, seat_price_cents: 0, limits: { members: 1, installs: 2, workspaces: 1 }, mods: { workspaces: { limits: { workspaces: 1, favorites: 2, stream: 0 } }, drips: { limits: { custom_drips: 2, fullscreen: 0 } } } },
  { name: 'Pro', version: 1, seat_price_cents: 900, limits: { members: 10, installs: 3, workspaces: null }, mods: { workspaces: { limits: { workspaces: null, favorites: null, stream: 1 } }, drips: { limits: { custom_drips: null, fullscreen: 1 } } } },
])

/** GET /v1/addons for a Free org: Drips and Programs, each on Pro and Team, per seat. */
export const addonOf = (mod: string, over: Record<string, unknown> = {}) => ({
  mod,
  name: mod[0]!.toUpperCase() + mod.slice(1),
  description: `The ${mod} mod.`,
  version: 1,
  price_cents: mod === 'drips' ? 200 : 400,
  per_seat: true,
  monthly_cents: mod === 'drips' ? 200 : 400,
  plans: ['Pro', 'Team'],
  free: false,
  allowed: false,
  limits: null,
  added: false,
  quantity: null,
  ...over,
})
export const ADDONS = [addonOf('drips'), addonOf('programs')]

/** POST /v1/billing/addons/preview's answer for Drips on a subscribed org. */
export const PREVIEW = { mod: 'drips', action: 'add', prorated_cents: 87, currency: 'usd', monthly_cents: 200, proration_date: 1_792_000_000 }

export type Answer = { status: number; body: unknown }
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: {}, text: typeof body === 'string' ? body : JSON.stringify(body) })
export const refusalBody = (code: string, message: string, detail: Record<string, unknown> = {}) => ({ error: { code, message, trace_id: 't-1', ...detail } })

export type Request = { method: string; path: string; headers: Record<string, string>; body: unknown }

/** The Glyphh server: what it was asked, and what it answers next. */
export function fakeServer(account: Account) {
  const s = {
    requests: [] as Request[],
    /** GET /v1/license's answer: a licence's text, or a status with no licence. */
    licence: account === 'signed-out' ? PRO : LICENCE_OF[account],
    licenceStatus: 200,
    plans: PLANS,
    deviceCode: { status: 200, body: { device_code: 'dev-code-1', user_code: 'BCDF-GHJK', verification_uri: `${SERVER}/v1/device`, verification_uri_complete: `${SERVER}/v1/device?code=BCDF-GHJK`, interval: 5, expires_in: 600 } } as Answer,
    /** POST /v1/device/token's answers in turn; pending once they run out. */
    tokens: [] as Answer[],
    checkout: [] as Answer[],
    portal: { status: 200, body: { url: 'https://billing.stripe.com/p/session/test_1' } } as Answer,
    addons: { status: 200, body: ADDONS } as Answer,
    /** POST /v1/billing/addons/preview's and POST /v1/billing/addons's answers in turn. */
    previews: [] as Answer[],
    adds: [] as Answer[],
    /** GET /v1/org: the org's seats; none, a 404. */
    org: null as { seats: number; seats_taken: number } | null,
    offline: false,
  }
  const asked = (path: string) => s.requests.filter(r => r.path === path)
  function handle(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
    if (s.offline) throw new Error('connection refused')
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    s.requests.push({ method, path, headers: { ...(init?.headers ?? {}) }, body: init?.body ? JSON.parse(init.body) : undefined })
    const authed = init?.headers?.Authorization === `Bearer ${TOKEN}`
    if (path === '/v1/plans') return res(200, s.plans)
    if (path === '/v1/device/code') return res(s.deviceCode.status, s.deviceCode.body)
    if (path === '/v1/device/token') {
      const next = s.tokens.shift()
      return next ? res(next.status, next.body) : res(400, refusalBody('authorization_pending', 'Waiting for the person to sign in and approve.'))
    }
    if (!authed) return res(401, refusalBody('E_UNAUTHORIZED', 'Sign in again.'))
    if (path === '/v1/license') return s.licenceStatus === 200 ? res(200, s.licence) : res(s.licenceStatus, refusalBody('E_HTTP', 'no'))
    if (path === '/v1/sign-out') return res(204, '')
    if (path === '/v1/billing/checkout') {
      const next = s.checkout.shift() ?? { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' } }
      return res(next.status, next.body)
    }
    if (path === '/v1/billing/portal') return res(s.portal.status, s.portal.body)
    if (path === '/v1/addons') return res(s.addons.status, s.addons.body)
    if (path === '/v1/billing/addons/preview') {
      const next = s.previews.shift() ?? { status: 409, body: refusalBody('E_CONFLICT', "Your org isn't subscribed: start with checkout.", { reason: 'not_subscribed' }) }
      return res(next.status, next.body)
    }
    if (path === '/v1/billing/addons' && method === 'POST') {
      const next = s.adds.shift() ?? { status: 200, body: [addonOf('drips', { allowed: true, added: true, quantity: 1 }), addonOf('programs', { allowed: true })] }
      return res(next.status, next.body)
    }
    if (path === '/v1/org' && s.org) return res(200, { id: 'o', name: 'Org', admin_user_id: 'u', plan: {}, members: 1, billing_status: 'none', ...s.org })
    return res(404, refusalBody('E_NOT_FOUND', 'Not Found'))
  }
  return Object.assign(s, { asked, handle })
}

export const ran = (stdout = '', exitCode = 0): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

/** This Mac's side of the account: the 0600 write, the remove, ioreg and
 *  scutil. Null for any other command. */
export function accountProcess(argv: string[], stdin: string | undefined, files: Map<string, string>, writes: { argv: string[]; stdin: string }[]): ProcessRunResult | null {
  if (argv[0] === '/bin/sh' && argv[2]?.startsWith('umask 077')) {
    writes.push({ argv, stdin: stdin ?? '' })
    files.set(argv[5]!, stdin ?? '')
    return ran()
  }
  if (argv[0] === '/bin/rm' && argv[1] === '-f') {
    files.delete(argv[2]!)
    return ran()
  }
  if (argv[0] === '/usr/sbin/ioreg') return ran(`+-o J316sAP  <class IOPlatformExpertDevice>\n    "IOPlatformUUID" = "${HARDWARE_UUID}"\n`)
  if (argv[0] === '/usr/sbin/scutil') return ran("Tim's MacBook Pro\n")
  return null
}
