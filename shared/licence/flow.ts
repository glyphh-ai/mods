// The account's life: one sign-in to Glyphh shared by every Glyphh mod on the
// machine (the server's device flow, RFC 8628), the plan's licence fetched,
// checked offline and refreshed before it runs out, Upgrade and Manage
// billing through the server's Stripe pages, and sign-out. The token and the
// licence live in ~/.glyphh (install.json, mode 0600; license.json), read
// again every few seconds so a sign-in or sign-out in another mod shows here
// too. It works on Deps, closures over `$` that ./hooks.tsx hands it.
import type { Timer } from 'claude-code'

import type { AccountState, Limits, PlanInfo } from '../../types'
import { access, INITIAL, limitOf, upgradeTarget } from './access.ts'
import { member, parseLexical, type Lexical } from './canonical.ts'
import { LIMITS, MOD, PRODUCT, type LimitName } from './config.ts'
import { INSTALL_FILE, LICENSE_FILE, RETRY_MS, SERVER, UPGRADE_POLL_MS, UPGRADE_WAIT_MS, WATCH_MS } from './server.ts'
import { verifyLicence, type Checked } from './verify.ts'

export type Response = { status: number; ok: boolean; text: string }
export type Machine = { machine_id?: string; name: string; surface: 'desktop' | 'cli'; mod_version: string }

export type Deps = {
  home(): Promise<string | undefined>
  /** A file's text, or null when it is not there. */
  read(path: string): Promise<string | null>
  /** Writes a file only its owner may read (0600), whole or not at all. */
  writePrivate(path: string, text: string): Promise<void>
  remove(path: string): Promise<void>
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response>
  state: { get(): Promise<AccountState>; set(fn: (s: AccountState) => AccountState): Promise<void> }
  now(): Promise<number>
  /** Runs `fn` after `ms`, or every `ms`, until cancelled. */
  after(ms: number, fn: () => Promise<void>): Timer
  every(ms: number, fn: () => Promise<void>): Timer
  /** This machine as the sign-in names it. */
  machine(): Promise<Machine>
  /** Opens a page in the person's browser; false when it could not. */
  open(url: string): Promise<boolean>
  copy(text: string): Promise<boolean>
  toast(text: string): void
  log(text: string): void
  /** The licence check; the embedded public key unless a test says. */
  verify?(licence: Lexical, installId: string): Promise<Checked>
}

type Install = { install_id: string; token: string }

/** This load's timers and what it last read. */
let watch: Timer | null = null
let signInTimer: Timer | null = null
let upgradeTimer: Timer | null = null
let seen = ''
let nextTryAt = 0
let refreshing: Promise<void> | null = null

/** Everything this load started, stopped. */
export function stop(): void {
  for (const t of [watch, signInTimer, upgradeTimer]) t?.cancel()
  watch = signInTimer = upgradeTimer = null
  refreshing = null
  seen = ''
  nextTryAt = 0
}

const report = (d: Deps, what: string, err: unknown) => d.log(`${MOD} account: ${what}: ${String(err instanceof Error ? err.message : err)}`)

async function paths(d: Deps): Promise<{ install: string; license: string } | null> {
  const home = (await d.home())?.replace(/\/$/, '')
  return home ? { install: `${home}/.glyphh/${INSTALL_FILE}`, license: `${home}/.glyphh/${LICENSE_FILE}` } : null
}

/** install.json: this server's install and its token; anything else is no sign-in. */
export function parseInstall(text: string | null): Install | null {
  if (!text) return null
  try {
    const v = JSON.parse(text) as Record<string, unknown>
    if (v?.server !== SERVER || typeof v.install_id !== 'string' || typeof v.token !== 'string' || !v.install_id || !v.token) return null
    return { install_id: v.install_id, token: v.token }
  } catch {
    return null
  }
}

/** license.json: when it was fetched, and the server's answer as it came. */
export function parseLicenceFile(text: string | null): { fetchedAt: number; licence: Lexical } | null {
  if (!text) return null
  try {
    const v = parseLexical(text)
    const at = member(v, 'fetched_at')
    const licence = member(v, 'license')
    const fetchedAt = at && typeof at === 'object' && 'num' in at ? Number(at.num) : NaN
    return Number.isFinite(fetchedAt) && licence !== undefined ? { fetchedAt, licence } : null
  } catch {
    return null
  }
}

const check = (d: Deps, licence: Lexical, installId: string) => (d.verify ?? verifyLicence)(licence, installId)

/** Reads the shared files into the state when they changed since the last read. */
export async function load(d: Deps, force = false): Promise<void> {
  const p = await paths(d)
  const installText = p ? await d.read(p.install) : null
  const licenceText = p ? await d.read(p.license) : null
  const now = `${installText ?? ''}\u0000${licenceText ?? ''}`
  if (!force && now === seen) return
  seen = now
  const install = parseInstall(installText)
  const file = install ? parseLicenceFile(licenceText) : null
  const checked = file && install ? await check(d, file.licence, install.install_id) : null
  if (checked && 'error' in checked) d.log(`${MOD} account: the stored licence was not used (${checked.error})`)
  const licence = checked && 'payload' in checked ? checked.payload : null
  await d.state.set(s => ({ ...s, install, licence, fetchedAt: licence ? file!.fetchedAt : null, ...(install ? { signIn: null } : {}) }))
}

/** When the licence is due a refresh: half its life after it was fetched. */
export function refreshDue(s: AccountState): number {
  if (!s.licence || s.fetchedAt === null) return 0
  return s.fetchedAt + (Date.parse(s.licence.expires_at) - s.fetchedAt) / 2
}

const bearer = (install: Install) => ({ Authorization: `Bearer ${install.token}` })

/** The refusal's message from the server's error body, `{ error: { code, message, ... } }`. */
export function errorOf(r: Response): { code: string; message: string; detail: Record<string, unknown> } {
  try {
    const e = (JSON.parse(r.text) as { error?: Record<string, unknown> }).error
    if (e && typeof e.code === 'string') return { code: e.code, message: typeof e.message === 'string' ? e.message : e.code, detail: e }
  } catch {
    // not the server's shape
  }
  return { code: `HTTP_${r.status}`, message: `The Glyphh server answered ${r.status}.`, detail: {} }
}

/** Signed out here: the shared files gone, the state cleared (the plans kept). */
async function forget(d: Deps, note: string | null): Promise<void> {
  const p = await paths(d)
  if (p) {
    await d.remove(p.install)
    await d.remove(p.license)
  }
  upgradeTimer?.cancel()
  upgradeTimer = null
  seen = ''
  await d.state.set(s => ({ ...INITIAL, plans: s.plans, note }))
}

/** Asks the server for the plan's licence and keeps it when it checks out. */
export function refresh(d: Deps): Promise<void> {
  refreshing ??= (async () => {
    const install = (await d.state.get()).install
    const p = await paths(d)
    if (!install || !p) return
    const r = await d.fetch(`${SERVER}/v1/license`, { headers: bearer(install) }).catch(() => null)
    if (r?.status === 401) return forget(d, 'Your Glyphh sign-in has ended. Sign in again.')
    if (!r?.ok) {
      nextTryAt = (await d.now()) + RETRY_MS
      return
    }
    let lexical: Lexical
    try {
      lexical = parseLexical(r.text)
    } catch {
      nextTryAt = (await d.now()) + RETRY_MS
      return d.log(`${MOD} account: the server's licence was not JSON`)
    }
    const checked = await check(d, lexical, install.install_id)
    if ('error' in checked) {
      nextTryAt = (await d.now()) + RETRY_MS
      return d.log(`${MOD} account: the server's licence was not used (${checked.error})`)
    }
    const fetchedAt = await d.now()
    // The answer goes in as it came, so its signature still checks out when read again.
    await d.writePrivate(p.license, `{"fetched_at":${fetchedAt},"license":${r.text.trim()}}\n`)
    seen = ''
    nextTryAt = 0
    await d.state.set(s => ({ ...s, licence: checked.payload, fetchedAt, note: s.note }))
  })()
    .catch(err => report(d, 'refresh', err))
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** The plans in the server's order, each with its limits for this mod when the server says them. */
export function parsePlans(text: string): PlanInfo[] {
  const list = JSON.parse(text) as unknown
  if (!Array.isArray(list)) return []
  return list.flatMap((p): PlanInfo[] => {
    if (!p || typeof p.name !== 'string') return []
    const mods: Record<string, Limits> = {}
    if (Array.isArray(p.mods)) {
      // Slugs only: included, its limits not said.
      for (const slug of p.mods) if (typeof slug === 'string') mods[slug] = {}
    } else if (p.mods && typeof p.mods === 'object') {
      for (const [slug, m] of Object.entries(p.mods as Record<string, { limits?: Limits }>)) mods[slug] = { ...(m?.limits ?? {}) }
    }
    return [{ name: p.name, mods }]
  })
}

export async function fetchPlans(d: Deps): Promise<void> {
  const r = await d.fetch(`${SERVER}/v1/plans`).catch(() => null)
  if (!r?.ok) return
  try {
    const plans = parsePlans(r.text)
    await d.state.set(s => ({ ...s, plans }))
  } catch (err) {
    report(d, 'plans', err)
  }
}

/** One read of the shared files, and a refresh when one is due. */
export async function tick(d: Deps): Promise<void> {
  await load(d)
  const s = await d.state.get()
  const now = await d.now()
  if (s.install && now >= refreshDue(s) && now >= nextTryAt) await refresh(d)
}

/** At each session start: the shared files read, the licence refreshed and
 *  the plans fetched in the background, and the files watched. */
export async function start(d: Deps): Promise<void> {
  stop()
  await d.state.set(s => ({ ...s, signIn: null, upgrading: null, note: null }))
  await load(d, true)
  watch = d.every(WATCH_MS, () => tick(d).catch(err => report(d, 'watch', err)))
  void refresh(d)
  void fetchPlans(d)
}

// ── Signing in ──────────────────────────────────────────────────────────────

type DeviceStart = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; interval: number; expires_in: number }

function deviceStartOf(text: string): DeviceStart | null {
  try {
    const v = JSON.parse(text) as DeviceStart
    const ok = ['device_code', 'user_code', 'verification_uri', 'verification_uri_complete'].every(k => typeof v[k as keyof DeviceStart] === 'string')
    return ok && Number.isFinite(v.interval) && Number.isFinite(v.expires_in) ? v : null
  } catch {
    return null
  }
}

/** Opens a page, or copies it when the browser could not open; says which. */
async function show(d: Deps, url: string, what: string): Promise<void> {
  if (await d.open(url)) return
  d.toast((await d.copy(url)) ? `The ${what} link is copied: paste it into your browser.` : `Open this link: ${url}`)
}

/** Starts signing in: a code from the server, its page opened, then the
 *  server asked at its interval until the person approves. Says what to do. */
export async function signIn(d: Deps): Promise<string> {
  if ((await d.state.get()).install) {
    // Signed in already: a licence that ran out is asked for again first.
    const held = (await d.state.get()).licence
    if (!held || Date.parse(held.expires_at) <= (await d.now())) await refresh(d)
    const l = (await d.state.get()).licence
    if (l && Date.parse(l.expires_at) > (await d.now())) return `Signed in to Glyphh (${l.plan} plan).`
  }
  const s = await d.state.get()
  if (s.signIn) return `Signing in: check the code ${s.signIn.userCode} at ${s.signIn.uri}`
  const r = await d.fetch(`${SERVER}/v1/device/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await d.machine()) }).catch(() => null)
  const started = r?.ok ? deviceStartOf(r.text) : null
  if (!started) {
    const note = r ? `Could not start signing in: ${errorOf(r).message}` : 'Could not reach Glyphh to sign in. Check your connection and try again.'
    await d.state.set(x => ({ ...x, note }))
    return note
  }
  await d.state.set(x => ({ ...x, signIn: { userCode: started.user_code, uri: started.verification_uri }, note: null }))
  const deadline = (await d.now()) + started.expires_in * 1000
  signInTimer?.cancel()
  const ask = (interval: number) => {
    signInTimer = d.after(interval * 1000, () => pollToken(d, started.device_code, interval, deadline).catch(err => report(d, 'sign-in', err)))
  }
  const pollToken = async (d: Deps, code: string, interval: number, until: number): Promise<void> => {
    if ((await d.now()) >= until) return endSignIn(d, 'The sign-in code expired. Sign in again.')
    const r = await d.fetch(`${SERVER}/v1/device/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_code: code }) }).catch(() => null)
    if (!(await d.state.get()).signIn) return // cancelled meanwhile
    if (r?.ok) return signedIn(d, r.text)
    const why = r ? errorOf(r).code : 'offline'
    if (why === 'expired_token') return endSignIn(d, 'The sign-in code expired. Sign in again.')
    if (why === 'access_denied') return endSignIn(d, 'The sign-in was declined.')
    ask(why === 'slow_down' ? interval + 5 : interval)
  }
  ask(started.interval)
  await show(d, started.verification_uri_complete, 'sign-in')
  return `Sign in to Glyphh: check the code ${started.user_code} at ${started.verification_uri} (opened in your browser).`
}

async function endSignIn(d: Deps, note: string | null): Promise<void> {
  signInTimer?.cancel()
  signInTimer = null
  await d.state.set(s => ({ ...s, signIn: null, note }))
}

/** The token arrived: kept in install.json for every Glyphh mod, then the licence fetched. */
async function signedIn(d: Deps, text: string): Promise<void> {
  let got: { access_token?: unknown; install_id?: unknown }
  try {
    got = JSON.parse(text)
  } catch {
    got = {}
  }
  const p = await paths(d)
  if (typeof got.access_token !== 'string' || typeof got.install_id !== 'string' || !p) return endSignIn(d, 'The sign-in did not finish. Sign in again.')
  const install: Install = { install_id: got.install_id, token: got.access_token }
  await d.writePrivate(p.install, `${JSON.stringify({ server: SERVER, ...install }, null, 2)}\n`)
  // A licence another install left behind is not this one's.
  await d.remove(p.license)
  seen = ''
  signInTimer = null
  await d.state.set(s => ({ ...s, install, licence: null, fetchedAt: null, signIn: null, note: null }))
  await refresh(d)
  const plan = (await d.state.get()).licence?.plan
  d.toast(plan ? `Signed in to Glyphh: ${plan} plan.` : 'Signed in to Glyphh.')
}

/** Stops a sign-in or a wait for checkout. */
export async function cancel(d: Deps): Promise<void> {
  upgradeTimer?.cancel()
  upgradeTimer = null
  await endSignIn(d, null)
  await d.state.set(s => ({ ...s, upgrading: null }))
}

/** Signs this machine out of Glyphh, for every Glyphh mod on it. */
export async function signOut(d: Deps): Promise<string> {
  const s = await d.state.get()
  await endSignIn(d, null)
  if (!s.install) {
    await forget(d, null)
    return 'Not signed in to Glyphh.'
  }
  // The server forgets the token; signed out here even when it cannot be reached.
  await d.fetch(`${SERVER}/v1/sign-out`, { method: 'POST', headers: bearer(s.install) }).catch(() => null)
  await forget(d, null)
  return 'Signed out of Glyphh on this Mac.'
}

// ── Billing ─────────────────────────────────────────────────────────────────

const ADMIN_ONLY = "Only your Glyphh org's admin can change its plan and billing."

/** Opens Stripe's billing page for the org (card, invoices, plan, cancel). */
export async function billing(d: Deps): Promise<string> {
  const install = (await d.state.get()).install
  if (!install) return say(d, 'Sign in to Glyphh first.')
  const r = await d.fetch(`${SERVER}/v1/billing/portal`, { method: 'POST', headers: bearer(install) }).catch(() => null)
  if (!r) return say(d, 'Could not reach Glyphh. Check your connection and try again.')
  if (r.ok) {
    const url = urlOf(r.text)
    if (url) {
      await show(d, url, 'billing')
      return say(d, null, 'Billing opened in your browser.')
    }
  }
  const e = errorOf(r)
  if (r.status === 403) return say(d, ADMIN_ONLY)
  if (e.detail.reason === 'no_billing') return say(d, 'No billing yet: Upgrade to a paid plan first.')
  return say(d, e.message)
}

function urlOf(text: string): string | null {
  try {
    const url = (JSON.parse(text) as { url?: unknown }).url
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null
  } catch {
    return null
  }
}

/** A note for the page and the line a command answers. */
async function say(d: Deps, note: string | null, line = note ?? ''): Promise<string> {
  await d.state.set(s => ({ ...s, note }))
  return line
}

/** Upgrade: checkout for the plan that lifts `limit` (or the next plan with
 *  this mod), opened in the browser; the licence then asked until the plan
 *  changes. An org already subscribed changes plan in Stripe's billing page. */
export async function upgrade(d: Deps, limit?: LimitName): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  if (!s.plans.length) await fetchPlans(d)
  const plans = (await d.state.get()).plans
  const have = limit ? (limitOf(access(s, await d.now()), limit) ?? 0) : 0
  const plan = upgradeTarget(plans, s.licence.plan, limit, have)
  if (!plan) return say(d, `There is no plan above ${s.licence.plan} to upgrade to.`)
  let seats = 1
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await d
      .fetch(`${SERVER}/v1/billing/checkout`, { method: 'POST', headers: { ...bearer(s.install), 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, seats }) })
      .catch(() => null)
    if (!r) return say(d, 'Could not reach Glyphh. Check your connection and try again.')
    const url = r.ok ? urlOf(r.text) : null
    if (url) {
      await show(d, url, 'checkout')
      await waitForPlan(d, s.licence.plan)
      return say(d, `Finish checkout in your browser: ${PRODUCT} updates on its own.`)
    }
    const e = errorOf(r)
    if (r.status === 403) return say(d, ADMIN_ONLY)
    if (e.detail.reason === 'subscribed') {
      const opened = await billing(d)
      if (opened === 'Billing opened in your browser.') {
        await waitForPlan(d, s.licence.plan)
        return say(d, `Change to ${plan} in the billing page: ${PRODUCT} updates on its own.`)
      }
      return opened
    }
    // Checkout counts a seat for each member and open invite.
    if (r.status === 409 && typeof e.detail.used === 'number' && e.detail.used > seats) {
      seats = e.detail.used
      continue
    }
    return say(d, e.message)
  }
  return say(d, 'Checkout could not start. Try again.')
}

/** The licence asked every few seconds until its plan is not `from`. */
async function waitForPlan(d: Deps, from: string): Promise<void> {
  upgradeTimer?.cancel()
  const until = (await d.now()) + UPGRADE_WAIT_MS
  await d.state.set(s => ({ ...s, upgrading: { plan: from } }))
  const timer: Timer = d.every(UPGRADE_POLL_MS, async () => {
    if (upgradeTimer !== timer) return
    if ((await d.now()) >= until) {
      timer.cancel()
      upgradeTimer = null
      await d.state.set(s => ({ ...s, upgrading: null, note: 'No plan change seen yet. Your plan updates here once checkout finishes.' }))
      return
    }
    await refresh(d)
    const plan = (await d.state.get()).licence?.plan
    if (upgradeTimer !== timer || !plan || plan === from) return
    timer.cancel()
    upgradeTimer = null
    await d.state.set(s => ({ ...s, upgrading: null, note: null }))
    d.toast(`Glyphh: you are on the ${plan} plan now.`)
  })
  upgradeTimer = timer
}

/** The limit names this mod knows, for a page's `upgrade:<limit>`. */
export const isLimit = (name: string): name is LimitName => name in LIMITS
