// Copied from shared/licence/access.ts by scripts/sync-shared.mjs: edit it there.
// What the plan allows now, from the account's state: signed out, signed in
// with the mod in the plan (and its limits), signed in without it, or the
// licence expired. Pure: the commands, the pages and the tests all read it.
import type { AccountState, Limits, PlanInfo } from '../../types'
import { ABOUT, LIMITS, MOD, PRODUCT, type LimitName } from './config.ts'

export const INITIAL: AccountState = { install: null, licence: null, fetchedAt: null, signIn: null, upgrading: null, plans: [], note: null }

export type Access =
  | { kind: 'signed-out' }
  | { kind: 'active'; plan: string; limits: Limits }
  | { kind: 'not-in-plan'; plan: string }
  /** The licence ran out (offline too long): Free's limits still hold when it was Free. */
  | { kind: 'expired'; plan: string; limits: Limits | null }

const isFree = (plan: string) => plan.trim().toLowerCase() === 'free'

export function access(s: AccountState, now: number): Access {
  const l = s.licence
  if (!s.install || !l) return { kind: 'signed-out' }
  const mine = l.mods[MOD]
  const limits = mine ? { ...(mine.limits ?? {}) } : null
  if (Date.parse(l.expires_at) <= now) return { kind: 'expired', plan: l.plan, limits: isFree(l.plan) ? limits : null }
  return limits ? { kind: 'active', plan: l.plan, limits } : { kind: 'not-in-plan', plan: l.plan }
}

/** A limit's value: a number, null for unlimited; a name the plan leaves out is 0. */
export function limitOf(a: Access, name: LimitName): number | null {
  const limits = a.kind === 'active' || a.kind === 'expired' ? a.limits : null
  if (!limits) return 0
  const v = limits[name]
  return v === undefined ? 0 : v
}

/** Why the mod may not be used at all now, or null when it may. */
export function gate(a: Access): string | null {
  if (a.kind === 'signed-out') return `Sign in to Glyphh to use ${PRODUCT}: /${MOD} signin.`
  if (a.kind === 'not-in-plan') return `${PRODUCT} is not in your ${a.plan} plan. Upgrade in /${MOD}.`
  if (a.kind === 'expired' && !a.limits) return `Your Glyphh licence has expired: /${MOD} signin to sign in again.`
  return null
}

const planLimit = (p: PlanInfo, name: string): number | null | undefined => {
  const limits = p.mods?.[MOD]
  if (!limits || !(name in limits)) return undefined
  return limits[name] ?? null
}

/** The first plan after `current` (in the server's order) whose limit is
 *  higher than `have`, or unlimited; null when none is known. */
export function liftingPlan(plans: PlanInfo[], current: string, name: string, have: number): string | null {
  const at = plans.findIndex(p => p.name.toLowerCase() === current.toLowerCase())
  for (const p of plans.slice(at + 1)) {
    if (p.name.toLowerCase() === current.toLowerCase()) continue
    const v = planLimit(p, name)
    if (v === null || (typeof v === 'number' && v > have)) return p.name
  }
  return null
}

/** The plan Upgrade goes to: the one that lifts `name` when there is one,
 *  else the next plan that includes this mod. */
export function upgradeTarget(plans: PlanInfo[], current: string | null, name?: string, have = 0): string | null {
  if (current && name) {
    const lifting = liftingPlan(plans, current, name, have)
    if (lifting) return lifting
  }
  const at = current ? plans.findIndex(p => p.name.toLowerCase() === current.toLowerCase()) : -1
  return plans.slice(at + 1).find(p => p.mods?.[MOD] !== undefined && p.name.toLowerCase() !== current?.toLowerCase())?.name ?? null
}

/** The line a limit refuses with: the limit and the plan that lifts it. */
export function limitLine(plan: string, plans: PlanInfo[], name: LimitName, have: number): string {
  const spec = LIMITS[name]
  const lifting = liftingPlan(plans, plan, name, have)
  const lifts = lifting ? `${lifting} lifts it` : 'A bigger plan lifts it'
  if (spec.kind === 'switch') return `${spec.label} is not in your ${plan} plan. ${lifting ? `${lifting} has it` : 'A bigger plan has it'}: Upgrade in /${MOD}.`
  return `Your ${plan} plan allows ${have} ${have === 1 ? spec.one : spec.label}. ${lifts}: Upgrade in /${MOD}.`
}

/** Why one more of `name` (having `used`) or, for a switch, using it, is
 *  refused; null when the plan allows it. */
export function refusal(s: AccountState, now: number, name: LimitName, used = 0): string | null {
  const a = access(s, now)
  const shut = gate(a)
  if (shut) return shut
  const limit = limitOf(a, name)
  if (limit === null) return null
  if (LIMITS[name].kind === 'switch' ? limit > 0 : used < limit) return null
  return limitLine((a as { plan: string }).plan, s.plans, name, limit)
}

/** Whether a switch limit is on. */
export const allows = (s: AccountState, now: number, name: LimitName) => refusal(s, now, name) === null

/** What a page shows of the account: its state in words and the limits,
 *  never the token. */
export type PageStatus = {
  kind: Access['kind']
  plan: string | null
  /** While signing in: the code to check and the page it is entered on. */
  signIn: { userCode: string; uri: string } | null
  isUpgrading: boolean
  note: string | null
  /** The plan's limits for this mod (null = unlimited), and the line each refuses with at its limit. */
  limits: Record<string, number | null>
  refusals: Record<string, string | null>
  /** Why the mod is closed: the gate's line, or null. */
  gate: string | null
  product: string
  about: readonly string[]
  command: string
}

export function pageStatus(s: AccountState, now: number): PageStatus {
  const a = access(s, now)
  const limits: Record<string, number | null> = {}
  const refusals: Record<string, string | null> = {}
  for (const name of Object.keys(LIMITS) as LimitName[]) {
    const limit = limitOf(a, name)
    limits[name] = limit
    refusals[name] = refusal(s, now, name, limit ?? 0)
  }
  return {
    kind: a.kind,
    plan: a.kind === 'signed-out' ? null : a.plan,
    signIn: s.signIn,
    isUpgrading: s.upgrading !== null,
    note: s.note,
    limits,
    refusals,
    gate: gate(a),
    product: PRODUCT,
    about: ABOUT,
    command: `/${MOD}`,
  }
}

/** What a page may ask of the account. `upgrade:<limit>` upgrades to the plan that lifts it. */
export type PageAction = 'signin' | 'cancel' | 'upgrade' | 'billing' | `upgrade:${string}`

export function pageAction(raw: unknown): PageAction | null {
  if (raw === 'signin' || raw === 'cancel' || raw === 'upgrade' || raw === 'billing') return raw
  if (typeof raw === 'string' && raw.startsWith('upgrade:') && raw.slice(8) in LIMITS) return raw as PageAction
  return null
}
