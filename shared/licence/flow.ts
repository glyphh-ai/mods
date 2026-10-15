// The account's life: one sign-in to Glyphh shared by every Glyphh mod on the
// machine (the server's device flow, RFC 8628), the plan's licence fetched,
// checked offline and refreshed before it runs out, Upgrade and Manage
// billing through the server's Stripe pages (each page opened in Claude's
// Browser pane on the desktop app), and sign-out. The token and the
// licence live in ~/.glyphh (install.json, mode 0600; license.json), read
// again every few seconds so a sign-in or sign-out in another mod shows here
// too. It works on Deps, closures over `$` that ./hooks.tsx hands it.
import type { Timer } from 'claude-code'

import type { AccountState, AddonInfo, AddonQuote, Limits, PlanInfo } from '../../types'
import { access, addonOf, addonPlan, INITIAL, limitOf, money, quoteLine, upgradeTarget } from './access.ts'
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
  /** Whether the Claude desktop app draws this session. */
  isDesktop(): Promise<boolean>
  /** Opens a page in the desktop app's Browser pane; false when the app refused. */
  browse(url: string): Promise<boolean>
  /** Asks Claude, as a prompt of its own once the command in progress is
   *  done: the way round the app refusing the mod's own call. */
  ask(text: string): void
  /** Opens a page in the person's browser (a terminal session); false when it could not. */
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

/** The plans in the server's order, each with its limits for this mod when
 *  the server says them, and its price a seat when it says it. */
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
    return [{ name: p.name, mods, ...(typeof p.seat_price_cents === 'number' ? { price: p.seat_price_cents } : {}) }]
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

/** The add-ons as GET /v1/addons lists them for the org's plan; junk is none. */
export function parseAddons(text: string): AddonInfo[] {
  const list = JSON.parse(text) as unknown
  if (!Array.isArray(list)) return []
  return list.flatMap((a): AddonInfo[] => {
    if (!a || typeof a.mod !== 'string' || typeof a.price_cents !== 'number' || !Array.isArray(a.plans)) return []
    const plans = (a.plans as unknown[]).filter((n): n is string => typeof n === 'string')
    const name = typeof a.name === 'string' ? a.name : a.mod
    return [{ mod: a.mod, name, price_cents: a.price_cents, per_seat: a.per_seat !== false, plans, free: a.free === true, allowed: a.allowed === true, added: a.added === true }]
  })
}

/** The add-on catalog for the org's plan, with what the org has (signed in only). */
export async function fetchAddons(d: Deps): Promise<void> {
  const install = (await d.state.get()).install
  if (!install) return
  const r = await d.fetch(`${SERVER}/v1/addons`, { headers: bearer(install) }).catch(() => null)
  if (!r?.ok) return
  try {
    const addons = parseAddons(r.text)
    await d.state.set(s => ({ ...s, addons }))
  } catch (err) {
    report(d, 'add-ons', err)
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
  await d.state.set(s => ({ ...s, signIn: null, upgrading: null, quote: null, note: null }))
  await load(d, true)
  watch = d.every(WATCH_MS, () => tick(d).catch(err => report(d, 'watch', err)))
  void refresh(d).then(() => fetchAddons(d))
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

/** Opens a page. On the desktop app, in Claude's Browser pane, or Claude is
 *  asked to open it there when the app refuses the mod's call; never the
 *  Mac's own browser. In a terminal, the link is printed and copied, and the
 *  browser opened. Says where it went, for the command's line. Only pages
 *  without a token come here: the device page carries the user code alone. */
async function show(d: Deps, url: string, what: string): Promise<string> {
  if (await d.isDesktop()) {
    if (await d.browse(url)) return 'opened in the browser pane'
    d.ask(`Open this page in the browser pane: ${url}`)
    return 'Claude is asked to open it in the browser pane'
  }
  const copied = await d.copy(url).catch(() => false)
  await d.open(url).catch(() => false)
  d.toast(copied ? `The ${what} link is copied: ${url}` : `Open this link: ${url}`)
  return copied ? `link copied: ${url}` : `open ${url}`
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
  const where = await show(d, started.verification_uri_complete, 'sign-in')
  return `Sign in to Glyphh: check the code ${started.user_code} at ${started.verification_uri} (${where}).`
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
  await fetchAddons(d)
  const plan = (await d.state.get()).licence?.plan
  d.toast(plan ? `Signed in to Glyphh: ${plan} plan.` : 'Signed in to Glyphh.')
}

/** Stops a sign-in, a wait for checkout or an add-on's price awaiting Confirm. */
export async function cancel(d: Deps): Promise<void> {
  upgradeTimer?.cancel()
  upgradeTimer = null
  await endSignIn(d, null)
  await d.state.set(s => ({ ...s, upgrading: null, quote: null }))
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
const ADMIN_ADDS = "Only your Glyphh org's admin can add mods."
const OFFLINE = 'Could not reach Glyphh. Check your connection and try again.'

/** Opens Stripe's billing page for the org (card, invoices, plan, cancel). */
export async function billing(d: Deps): Promise<string> {
  return (await openBilling(d)).line
}

/** The billing page opened, and where; or why not. */
async function openBilling(d: Deps): Promise<{ line: string; where: string | null }> {
  const refused = async (note: string) => ({ line: await say(d, note), where: null })
  const install = (await d.state.get()).install
  if (!install) return refused('Sign in to Glyphh first.')
  const r = await d.fetch(`${SERVER}/v1/billing/portal`, { method: 'POST', headers: bearer(install) }).catch(() => null)
  if (!r) return refused('Could not reach Glyphh. Check your connection and try again.')
  if (r.ok) {
    const url = urlOf(r.text)
    if (url) {
      const where = await show(d, url, 'billing')
      return { line: await say(d, null, `Billing: ${where}.`), where }
    }
  }
  const e = errorOf(r)
  if (r.status === 403) return refused(ADMIN_ONLY)
  if (e.detail.reason === 'no_billing') return refused('No billing yet: Upgrade to a paid plan first.')
  return refused(e.message)
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
 *  changes. An org already subscribed changes plan in Stripe's billing page.
 *  A mod not in the plan that is sold as an add-on is added instead (addOn). */
export async function upgrade(d: Deps, limit?: LimitName): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  if (!limit && !s.licence.mods[MOD]) {
    await fetchAddons(d)
    const addon = addonOf(await d.state.get())
    if (addon) return addAddon(d, addon)
  }
  return planUpgrade(d, limit)
}

/** Checkout for the plan that lifts `limit`, or the next plan with this mod. */
async function planUpgrade(d: Deps, limit?: LimitName): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  if (!s.plans.length) await fetchPlans(d)
  const plans = (await d.state.get()).plans
  const have = limit ? (limitOf(access(s, await d.now()), limit) ?? 0) : 0
  const plan = upgradeTarget(plans, s.licence.plan, limit, have)
  if (!plan) return say(d, `There is no plan above ${s.licence.plan} to upgrade to.`)
  return checkout(d, s.install, s.licence.plan, plan, [])
}

const post = (d: Deps, install: Install, path: string, body: unknown) =>
  d.fetch(`${SERVER}${path}`, { method: 'POST', headers: { ...bearer(install), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)

/** The org's seats, never fewer than are taken; 1 when the server does not say. */
async function orgSeats(d: Deps, install: Install): Promise<number> {
  const r = await d.fetch(`${SERVER}/v1/org`, { headers: bearer(install) }).catch(() => null)
  if (!r?.ok) return 1
  try {
    const org = JSON.parse(r.text) as { seats?: unknown; seats_taken?: unknown }
    const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 1)
    return Math.max(n(org.seats), n(org.seats_taken))
  } catch {
    return 1
  }
}

/** Stripe Checkout for `plan` per seat (the org's seats) and each add-on in
 *  `addons`, opened; the licence then asked until the plan changes (or, with
 *  an add-on, until this mod is in it). */
async function checkout(d: Deps, install: Install, from: string, plan: string, addons: string[]): Promise<string> {
  let seats = await orgSeats(d, install)
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await post(d, install, '/v1/billing/checkout', addons.length ? { plan, seats, addons } : { plan, seats })
    if (!r) return say(d, OFFLINE)
    const url = r.ok ? urlOf(r.text) : null
    if (url) {
      const where = await show(d, url, 'checkout')
      await waitForPlan(d, from, addons.length ? MOD : undefined)
      return say(d, `Finish checkout (${where}): ${PRODUCT} updates on its own.`)
    }
    const e = errorOf(r)
    if (r.status === 403) return say(d, addons.length ? ADMIN_ADDS : ADMIN_ONLY)
    if (e.detail.reason === 'subscribed' && !addons.length) {
      const opened = await openBilling(d)
      if (opened.where) {
        await waitForPlan(d, from)
        return say(d, `Change to ${plan} in the billing page (${opened.where}): ${PRODUCT} updates on its own.`)
      }
      return opened.line
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

/** Adds this mod's add-on: an org not subscribed yet subscribes through
 *  Checkout to the cheapest plan that allows it, with it; a subscribed org is
 *  shown what it costs now (prorated) and a month, to Confirm. Not sold as an
 *  add-on, Upgrade to the plan that has it. Says what to do. */
export async function addOn(d: Deps): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  if (s.licence.mods[MOD]) return say(d, `${PRODUCT} is in your ${s.licence.plan} plan already.`)
  await fetchAddons(d)
  const addon = addonOf(await d.state.get())
  return addon ? addAddon(d, addon) : planUpgrade(d)
}

/** The preview's answer: what adding it costs now and a month. */
function quoteOf(text: string): AddonQuote | null {
  try {
    const v = JSON.parse(text) as Record<string, unknown>
    const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x)
    if (v.mod !== MOD || !int(v.prorated_cents) || !int(v.monthly_cents) || !int(v.proration_date)) return null
    const currency = typeof v.currency === 'string' && v.currency ? v.currency : 'usd'
    return { mod: MOD, proratedCents: v.prorated_cents as number, monthlyCents: v.monthly_cents as number, currency, prorationDate: v.proration_date as number }
  } catch {
    return null
  }
}

async function addAddon(d: Deps, addon: AddonInfo): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  const r = await post(d, s.install, '/v1/billing/addons/preview', { mod: MOD, action: 'add' })
  if (!r) return say(d, OFFLINE)
  if (r.ok) {
    const quote = quoteOf(r.text)
    if (!quote) return say(d, `The Glyphh server answered ${r.status}.`)
    await d.state.set(x => ({ ...x, quote }))
    return say(d, null, `${quoteLine(quote)} Confirm in /${MOD}, or /${MOD} add confirm.`)
  }
  const e = errorOf(r)
  if (r.status === 403) return say(d, ADMIN_ADDS)
  if (e.detail.reason === 'not_subscribed') {
    if (!s.plans.length) await fetchPlans(d)
    const plan = addonPlan(addon, (await d.state.get()).plans, s.licence.plan)
    if (!plan) return say(d, `${PRODUCT} is not sold with any plan yet.`)
    return checkout(d, s.install, s.licence.plan, plan, [MOD])
  }
  if (e.detail.reason === 'already_added') return alreadyAdded(d)
  if (e.detail.reason === 'not_on_plan') {
    const plan = addonPlan({ ...addon, allowed: false }, s.plans, s.licence.plan)
    return say(d, `${PRODUCT} isn't sold with your ${s.licence.plan} plan. ${plan ? `Change to ${plan}` : 'Change plan'} in Manage billing, then add it.`)
  }
  return say(d, e.message)
}

/** The org has the add-on already: the licence asked for again. */
async function alreadyAdded(d: Deps): Promise<string> {
  await d.state.set(x => ({ ...x, quote: null }))
  await refresh(d)
  await fetchAddons(d)
  const has = Boolean((await d.state.get()).licence?.mods[MOD])
  return say(d, has ? null : `Your org has ${PRODUCT} already: it opens here once your licence updates.`, has ? `Your org has ${PRODUCT} already.` : undefined)
}

/** Adds the add-on at the price the preview showed (its proration date
 *  passed back, so Stripe charges exactly that), then the licence refreshed. */
export async function confirmAddOn(d: Deps): Promise<string> {
  const s = await d.state.get()
  if (!s.install || !s.licence) return signIn(d)
  const quote = s.quote?.mod === MOD ? s.quote : null
  if (!quote) return say(d, `Nothing to confirm: add ${PRODUCT} in /${MOD} first.`)
  const r = await post(d, s.install, '/v1/billing/addons', { mod: MOD, proration_date: quote.prorationDate })
  if (!r) return say(d, OFFLINE)
  await d.state.set(x => ({ ...x, quote: null }))
  if (!r.ok) {
    const e = errorOf(r)
    if (r.status === 403) return say(d, ADMIN_ADDS)
    if (e.detail.reason === 'already_added') return alreadyAdded(d)
    return say(d, e.message)
  }
  await refresh(d)
  await fetchAddons(d)
  if ((await d.state.get()).licence?.mods[MOD]) {
    d.toast(`Glyphh: ${PRODUCT} is added.`)
    return say(d, null, `${PRODUCT} is added: ${money(quote.monthlyCents, quote.currency)}/month on your plan.`)
  }
  await waitForPlan(d, s.licence.plan, MOD)
  return say(d, null, `${PRODUCT} is added: it opens here once your licence updates.`)
}

/** The licence asked every few seconds until its plan is not `from` or,
 *  waiting for an add-on, until `mod` is in it. */
async function waitForPlan(d: Deps, from: string, mod?: string): Promise<void> {
  upgradeTimer?.cancel()
  const until = (await d.now()) + UPGRADE_WAIT_MS
  await d.state.set(s => ({ ...s, upgrading: mod ? { plan: from, mod } : { plan: from } }))
  const timer: Timer = d.every(UPGRADE_POLL_MS, async () => {
    if (upgradeTimer !== timer) return
    if ((await d.now()) >= until) {
      timer.cancel()
      upgradeTimer = null
      const note = mod ? `${PRODUCT} is not in your plan yet. It opens here once checkout finishes.` : 'No plan change seen yet. Your plan updates here once checkout finishes.'
      await d.state.set(s => ({ ...s, upgrading: null, note }))
      return
    }
    await refresh(d)
    const l = (await d.state.get()).licence
    const done = l && (mod ? Boolean(l.mods[mod]) : l.plan !== from)
    if (upgradeTimer !== timer || !done) return
    timer.cancel()
    upgradeTimer = null
    await d.state.set(s => ({ ...s, upgrading: null, note: null }))
    if (mod) await fetchAddons(d)
    d.toast(mod ? `Glyphh: ${PRODUCT} is in your ${l.plan} plan now.` : `Glyphh: you are on the ${l.plan} plan now.`)
  })
  upgradeTimer = timer
}

/** The limit names this mod knows, for a page's `upgrade:<limit>`. */
export const isLimit = (name: string): name is LimitName => name in LIMITS
