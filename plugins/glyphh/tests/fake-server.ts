// A fake Glyphh server in memory, to the API in server/docs/architecture.md:
// no network. Each call is recorded with its bearer.
import type { HttpInit, HttpResponse } from 'claude-code'

import { keyPair } from '../hooks/glyphh/ed25519'

type Json = Record<string, unknown>
export type Call = { method: string; path: string; body: Json; bearer?: string }

const TOKEN = 'tok-secret-1'
const SEED = new Uint8Array(32).fill(7)
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

function newState() {
  return {
    calls: [] as Call[],
    polls: ['authorization_pending', 'slow_down', 'ok'] as string[],
    members: [
      { user_id: 'u1', name: 'Chris', email: 'chris@example.com', role: 'admin' },
      { user_id: 'u2', name: 'Sam', email: 'sam@example.com', role: 'member' },
    ] as Json[],
    invites: [] as Json[],
    installs: [{ id: 'i1', name: 'mac', surface: 'desktop' }, { id: 'i2', name: 'laptop', surface: 'cli' }] as Json[],
    role: 'admin',
    providers: ['google'] as string[],
    name: 'Chris',
    orgName: 'Glyphh',
    plan: 'Free',
    billingStatus: 'none',
    licenseTamper: false,
    licenseExpires: '2999-01-01T00:00:00Z',
  }
}

type State = ReturnType<typeof newState>

// GET /v1/plans as the server lists them: Enterprise's price is each
// contract's own, so null; it is never checked out.
const plan = (name: string, price_cents: number | null, interval: string | null, machines: number | null, precedents: number | null) => ({
  name,
  version: 1,
  price_cents,
  interval,
  self_serve: price_cents !== null,
  limits: { machines, precedents },
  features: { sync: name !== 'Free', ha: name === 'Enterprise', offline: name === 'Enterprise', sso: name === 'Enterprise' },
  markup_hidden: true,
})

export const PLANS = [
  plan('Free', 0, null, 0, 0),
  plan('Pro', 9900, 'month', 3, 100000),
  plan('Team', 29900, 'month', 10, 1000000),
  plan('Enterprise', null, 'year', null, null),
]

const meOf = (s: State) => {
  const p = PLANS.find(x => x.name === s.plan) ?? PLANS[0]!
  const hosted = p.limits.machines !== 0
  return {
    id: 'u1',
    email: 'chris@example.com',
    name: s.name,
    role: s.role,
    providers: [...s.providers],
    org: { id: 'o1', name: s.orgName, billing_status: s.billingStatus, renews_at: null, plan_until: s.plan === 'Enterprise' ? '2027-10-18T23:59:59Z' : null },
    plan: p,
    precedents: { used: hosted ? 12345 : 0, limit: p.limits.precedents },
    hosting: {
      month: '2026-10',
      month_to_date_cents: hosted ? 1234 : 0,
      machines: hosted ? [{ id: 'm1', name: 'ada-prod', size: 'small', cents: 1234 }] : [],
    },
  }
}

const refuse = (status: number, code: string, message: string, detail: Json = {}) => ({
  status,
  body: { error: { code, message, trace_id: 'tr-1', ...detail } },
})

async function license(s: State) {
  const claims = {
    plan: 'Pro',
    limits: { machines: 3 },
    features: { sync: true, ha: false, offline: false, sso: false },
    mods: { ada: { limits: { precedents: null } } },
    expires_at: s.licenseExpires,
  }
  const payload = JSON.stringify(claims)
  const { sign } = await keyPair(SEED)
  const sig = await sign(new TextEncoder().encode(payload))
  return { payload: s.licenseTamper ? payload.replace('Pro', 'Team') : payload, signature: b64(sig) }
}


async function route(s: State, c: Call): Promise<{ status: number; body: unknown }> {
  const ok = (body: unknown = {}) => ({ status: 200, body })
  const open = ['/v1/device/code', '/v1/device/token', '/v1/plans']
  if (!open.includes(c.path) && c.bearer !== TOKEN) return refuse(401, 'E_UNAUTHORIZED', 'Bad token.')
  const key = `${c.method} ${c.path.replace(/\/v1\/(installs|org\/members|org\/invites|me\/identities)\/[^/]+$/, '/v1/$1/:id')}`
  const id = decodeURIComponent(c.path.split('/').pop() ?? '')
  switch (key) {
    case 'POST /v1/device/code':
      return ok({ device_code: 'dc-1', user_code: 'ABCD-EFGH', verification_uri: 'https://glyphh.test/v1/device', verification_uri_complete: 'https://glyphh.test/v1/device?code=ABCD-EFGH', interval: 5, expires_in: 600 })
    case 'POST /v1/device/token': {
      const next = s.polls.shift() ?? 'ok'
      return next === 'ok' ? ok({ access_token: TOKEN, install_id: 'i1' }) : { status: 400, body: { error: next } }
    }
    case 'GET /v1/me': return ok(meOf(s))
    case 'PATCH /v1/me': s.name = String(c.body.name); return ok(meOf(s))
    case 'POST /v1/me/identities': {
      const p = String(c.body.provider)
      if (s.providers.includes(p)) return refuse(409, 'E_CONFLICT', `${p} is already linked.`)
      return ok({ url: `https://accounts.${p}.test/auth?link=1` })
    }
    case 'DELETE /v1/me/identities/:id':
      if (s.providers.length <= 1) return refuse(409, 'E_CONFLICT', 'You need at least one way to sign in.')
      s.providers = s.providers.filter(p => p !== id); return { status: 204, body: '' }
    case 'GET /v1/installs': return ok({ installs: s.installs })
    case 'DELETE /v1/installs/:id': s.installs = s.installs.filter(i => i.id !== id); return ok()
    case 'POST /v1/sign-out': return ok()
    case 'GET /v1/license': return ok(await license(s))
    case 'GET /v1/license/key': return ok({ key: b64((await keyPair(SEED)).publicKey) })
    default: return adminRoute(s, c, key, id, ok)
  }
}


function adminRoute(s: State, c: Call, key: string, id: string, ok: (b?: unknown) => { status: number; body: unknown }) {
  const isWrite = c.method !== 'GET'
  if (isWrite && s.role !== 'admin' && key.includes('/org')) return refuse(403, 'E_FORBIDDEN', 'Admins only.')
  switch (key) {
    case 'GET /v1/org': return ok({ id: 'o1', name: s.orgName })
    case 'PATCH /v1/org': s.orgName = String(c.body.name); return ok()
    case 'GET /v1/org/members': return ok({ members: s.members })
    case 'DELETE /v1/org/members/:id': s.members = s.members.filter(m => m.user_id !== id); return ok()
    case 'GET /v1/org/invites': return ok({ invites: s.invites })
    case 'POST /v1/org/invites': {
      s.invites.push({ id: `inv-${s.invites.length + 1}`, email: c.body.email })
      return ok({ id: 'inv-1', link: 'https://glyphh.test/join?t=abc' })
    }
    case 'DELETE /v1/org/invites/:id': s.invites = s.invites.filter(i => i.id !== id); return ok()
    case 'GET /v1/plans': return ok(PLANS)
    case 'POST /v1/billing/checkout': return checkout(s, c, ok)
    case 'POST /v1/billing/portal': return ok({ url: 'https://billing.stripe.test/p1' })
    case 'POST /v1/billing/plan': return changePlan(s, c, ok)
    default: return refuse(404, 'E_NOT_FOUND', `No route ${key}`)
  }
}


// The server's refusals: Enterprise is never checked out, a subscribed org
// changes plan instead, an Enterprise org's plan is its contract's.
function checkout(s: State, c: Call, ok: (b?: unknown) => { status: number; body: unknown }) {
  const p = PLANS.find(x => x.name === c.body.plan)
  if (p && !p.self_serve) return refuse(422, 'E_INVALID', 'Enterprise is by contract: talk to us at sales@glyphh.ai.', { reason: 'not_self_serve' })
  if (s.billingStatus === 'active') return refuse(409, 'E_CONFLICT', 'Your org is already subscribed: change plan instead.', { reason: 'subscribed' })
  return ok({ url: 'https://checkout.stripe.test/c1' })
}

function changePlan(s: State, c: Call, ok: (b?: unknown) => { status: number; body: unknown }) {
  if (s.plan === 'Enterprise') return refuse(409, 'E_CONFLICT', 'Your Enterprise plan is by contract: talk to us at sales@glyphh.ai.', { reason: 'contract' })
  if (s.billingStatus !== 'active') return refuse(409, 'E_CONFLICT', "Your org isn't subscribed: start with checkout.", { reason: 'not_subscribed' })
  s.plan = String(c.body.plan)
  return ok({ id: 'o1', name: s.orgName })
}


export function fakeServer() {
  const s = newState()
  async function fetch(url: string, init: HttpInit = {}): Promise<HttpResponse> {
    const u = new URL(url)
    const bearer = init.headers?.Authorization?.replace(/^Bearer /, '')
    const call: Call = { method: init.method ?? 'GET', path: u.pathname, body: init.body ? (JSON.parse(init.body) as Json) : {}, bearer }
    s.calls.push(call)
    const r = await route(s, call)
    return { status: r.status, ok: r.status < 300, headers: {}, text: r.status === 204 ? "" : JSON.stringify(r.body) }
  }

  return { s, fetch, TOKEN }
}
