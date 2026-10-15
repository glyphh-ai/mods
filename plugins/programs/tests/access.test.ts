import { describe, expect, test } from 'claude-code/testing'

import type { AccountState, LicencePayload, PlanInfo } from '../types'
import { access, gate, INITIAL, liftingPlan, limitLine, limitOf, pageAction, pageStatus, refusal, upgradeTarget } from '../hooks/licence/access.ts'
import { INSTALL } from './licences.ts'

const NOW = Date.parse('2026-10-15T09:00:00Z')
const FAR = '2027-01-01T00:00:00Z'
const PAST = '2026-10-01T00:00:00Z'

const PLANS: PlanInfo[] = [
  { name: 'Free', mods: { programs: { programs: 1, runs_per_day: 10 } } },
  { name: 'Team', mods: { programs: { programs: 3, runs_per_day: 100 } } },
  { name: 'Pro', mods: { programs: { programs: null, runs_per_day: null } } },
]

const licence = (plan: string, limits: Record<string, number | null> | null, expires = FAR): LicencePayload => ({
  install_id: INSTALL,
  user_id: 'u',
  org_id: 'o',
  plan,
  mods: limits ? { programs: { limits }, workspaces: { limits: {} } } : { workspaces: { limits: {} } },
  expires_at: expires,
})

const signedIn = (l: LicencePayload | null, plans = PLANS): AccountState => ({ ...INITIAL, install: { install_id: INSTALL, token: 't' }, licence: l, fetchedAt: NOW, plans })

const FREE = signedIn(licence('Free', { programs: 1, runs_per_day: 10 }))

describe('what the plan allows Programs', () => {
  test('signed out without an install or a licence', () => {
    expect(access(INITIAL, NOW)).toEqual({ kind: 'signed-out' })
    expect(gate(access(INITIAL, NOW))).toBe('Sign in to Glyphh to use Programs: /programs signin.')
  })

  test('in the plan (the add-on): its limits; a name it leaves out is 0, null is unlimited', () => {
    const a = access(signedIn(licence('Pro', { programs: null })), NOW)
    expect(a).toEqual({ kind: 'active', plan: 'Pro', limits: { programs: null } })
    expect(limitOf(a, 'programs')).toBeNull()
    expect(limitOf(a, 'runs_per_day')).toBe(0)
    expect(gate(a)).toBeNull()
  })

  test('not in the plan: closed, with Upgrade', () => {
    const a = access(signedIn(licence('Free', null)), NOW)
    expect(a).toEqual({ kind: 'not-in-plan', plan: 'Free' })
    expect(gate(a)).toBe('Programs is not in your Free plan. Upgrade in /programs.')
  })

  test('expired: Free keeps its limits; any other plan closes until signed in again', () => {
    expect(gate(access(signedIn(licence('Free', { programs: 1 }, PAST)), NOW))).toBeNull()
    expect(gate(access(signedIn(licence('Pro', { programs: null }, PAST)), NOW))).toBe('Your Glyphh licence has expired: /programs signin to sign in again.')
  })
})

describe('the limits, refused with the plan that lifts them', () => {
  test('programs: allowed below the limit, refused at it', () => {
    expect(refusal(FREE, NOW, 'programs', 0)).toBeNull()
    expect(refusal(FREE, NOW, 'programs', 1)).toBe('Your Free plan allows 1 program. Team lifts it: Upgrade in /programs.')
  })

  test('runs a day: refused at the day\'s count', () => {
    expect(refusal(FREE, NOW, 'runs_per_day', 9)).toBeNull()
    expect(refusal(FREE, NOW, 'runs_per_day', 10)).toBe('Your Free plan allows 10 runs a day. Team lifts it: Upgrade in /programs.')
    expect(limitLine('Free', [], 'runs_per_day', 1)).toBe('Your Free plan allows 1 run a day. A bigger plan lifts it: Upgrade in /programs.')
  })

  test('the lifting plan and the Upgrade target', () => {
    expect(liftingPlan(PLANS, 'Free', 'programs', 1)).toBe('Team')
    expect(liftingPlan(PLANS, 'Team', 'programs', 3)).toBe('Pro')
    expect(upgradeTarget(PLANS, 'Free')).toBe('Team')
    expect(upgradeTarget(PLANS, 'Pro')).toBeNull()
  })
})

describe('what a page is told: words and limits, never the token', () => {
  test('signed in on Free: the plan, its limits and the lines', () => {
    expect(pageStatus(FREE, NOW)).toMatchObject({
      kind: 'active',
      plan: 'Free',
      limits: { programs: 1, runs_per_day: 10 },
      gate: null,
      product: 'Programs',
      command: '/programs',
    })
    expect(JSON.stringify(pageStatus(FREE, NOW))).not.toContain('"t"')
  })

  test("the page's asks: limits of this mod only", () => {
    for (const a of ['signin', 'upgrade:programs', 'upgrade:runs_per_day']) expect(pageAction(a)).toBe(a)
    for (const a of ['upgrade:fullscreen', 5]) expect(pageAction(a)).toBeNull()
  })
})
