// Reading the server's answers loosely: a field may sit at the top or under
// its object (`me.user.name` or `me.name`), so the panels survive small
// differences in the server's shapes.
import type { Json } from '../../types'

export const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
export const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : String(v))

export const userOf = (me: Json | null): Json => obj(me?.user ?? me)
export const orgOf = (me: Json | null): Json => obj(me?.org)
export const planOf = (me: Json | null): Json => obj(me?.plan ?? orgOf(me).plan)
/** The managed precedents the org's hosted runtimes hold, of the plan's bucket: `{used, limit}`. */
export const precedentsOf = (me: Json | null): Json => obj(me?.precedents)
/** The hosted machines' month so far: `{month, month_to_date_cents, machines}`. */
export const hostingOf = (me: Json | null): Json => obj(me?.hosting)

export const isAdmin = (me: Json | null): boolean => str(userOf(me).role ?? me?.role ?? orgOf(me).role) === 'admin'

export const planName = (me: Json | null): string => {
  const p = me?.plan ?? orgOf(me).plan
  if (typeof p === 'string') return p
  const plan = obj(p)
  return `${str(plan.name, 'unknown')}${plan.version !== undefined ? ` (v${str(plan.version)})` : ''}`
}

/** A limit as read: empty is unlimited. */
export const limitText = (v: unknown): string => (v === null || v === undefined ? 'unlimited' : String(v))

/** An id from an item that may call it `id`, `user_id` or `install_id`. */
export const idOf = (item: Json, ...keys: string[]): string => str([...keys, 'id'].map(k => item[k]).find(v => v !== undefined))

export const isSubscribed = (me: Json | null): boolean => {
  const org = orgOf(me)
  if (org.stripe_subscription_id || org.subscribed === true) return true
  return ['active', 'trialing', 'past_due'].includes(str(org.billing_status))
}

/** Cents as dollars: whole dollars when there are no cents, e.g. $99 or $12.34. */
export const money = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** A count with thousands marked: 100000 is 100,000. */
export const count = (n: unknown): string => (typeof n === 'number' ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : str(n, '0'))

/** Bought with Stripe Checkout; Enterprise is not, it is by contract. */
export const isSelfServe = (plan: Json): boolean => plan.self_serve !== false

/** A plan's price as GET /v1/plans says it: $99/month, $0, or By contract
 *  (Enterprise's price is each customer's own and is never shown). */
export const priceText = (plan: Json): string => {
  const cents = plan.price_cents
  if (typeof cents !== 'number') return 'By contract'
  return plan.interval === 'month' || plan.interval === 'year' ? `${money(cents)}/${plan.interval}` : money(cents)
}

/** A plan's managed precedents and hosted machines, e.g. 100,000 managed
 *  precedents · 3 hosted machines; null is unlimited, 0 is none. */
export const planLimits = (plan: Json): string => {
  const limits = obj(plan.limits)
  const of = (v: unknown, what: string) => (v === null || v === undefined ? `unlimited ${what}` : v === 0 ? `no ${what}` : `${count(v)} ${what}`)
  return `${of(limits.precedents, 'managed precedents')} · ${of(limits.machines, 'hosted machines')}`
}
