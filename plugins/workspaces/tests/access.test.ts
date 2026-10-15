import { describe, expect, test } from 'claude-code/testing'

import type { AccountState, LicencePayload, PlanInfo } from '../types'
import { access, gate, INITIAL, liftingPlan, limitLine, limitOf, pageAction, pageStatus, refusal, upgradeTarget } from '../hooks/licence/access.ts'
import { INSTALL } from './licences.ts'

const NOW = Date.parse('2026-10-15T09:00:00Z')
const FAR = '2027-01-01T00:00:00Z'
const PAST = '2026-10-01T00:00:00Z'

const PLANS: PlanInfo[] = [
  { name: 'Free', mods: { workspaces: { workspaces: 1, favorites: 2, stream: 0 } } },
  { name: 'Team', mods: { workspaces: { workspaces: 3, favorites: 10, stream: 0 } } },
  { name: 'Pro', mods: { workspaces: { workspaces: null, favorites: null, stream: 1 } } },
]

const licence = (plan: string, limits: Record<string, number | null> | null, expires = FAR): LicencePayload => ({
  install_id: INSTALL,
  user_id: 'u',
  org_id: 'o',
  plan,
  mods: limits ? { workspaces: { limits }, drips: { limits: {} } } : { drips: { limits: {} } },
  expires_at: expires,
})

const signedIn = (l: LicencePayload | null, plans = PLANS): AccountState => ({ ...INITIAL, install: { install_id: INSTALL, token: 't' }, licence: l, fetchedAt: NOW, plans })

const FREE = signedIn(licence('Free', { workspaces: 1, favorites: 2, stream: 0 }))

describe('what the plan allows Workspaces', () => {
  test('signed out without an install or a licence', () => {
    expect(access(INITIAL, NOW)).toEqual({ kind: 'signed-out' })
    expect(access({ ...INITIAL, install: { install_id: INSTALL, token: 't' } }, NOW)).toEqual({ kind: 'signed-out' })
    expect(gate(access(INITIAL, NOW))).toBe('Sign in to Glyphh to use Workspaces: /workspaces signin.')
  })

  test('in the plan: its limits; a name the plan leaves out is 0, null is unlimited', () => {
    const a = access(signedIn(licence('Pro', { workspaces: null, favorites: 5 })), NOW)
    expect(a).toEqual({ kind: 'active', plan: 'Pro', limits: { workspaces: null, favorites: 5 } })
    expect(limitOf(a, 'workspaces')).toBeNull()
    expect(limitOf(a, 'favorites')).toBe(5)
    expect(limitOf(a, 'stream')).toBe(0)
    expect(gate(a)).toBeNull()
    expect(limitOf(access(signedIn({ ...licence('Pro', null), mods: { workspaces: {} } }), NOW), 'workspaces')).toBe(0)
  })

  test('not in the plan: closed, with Upgrade', () => {
    const a = access(signedIn(licence('Free', null)), NOW)
    expect(a).toEqual({ kind: 'not-in-plan', plan: 'Free' })
    expect(limitOf(a, 'workspaces')).toBe(0)
    expect(gate(a)).toBe('Workspaces is not in your Free plan. Upgrade in /workspaces.')
  })

  test('expired: Free keeps its limits; any other plan closes until signed in again', () => {
    const free = access(signedIn(licence('free', { workspaces: 1 }, PAST)), NOW)
    expect(free).toEqual({ kind: 'expired', plan: 'free', limits: { workspaces: 1 } })
    expect(gate(free)).toBeNull()
    expect(limitOf(free, 'workspaces')).toBe(1)
    const pro = access(signedIn(licence('Pro', { workspaces: null }, PAST)), NOW)
    expect(pro).toEqual({ kind: 'expired', plan: 'Pro', limits: null })
    expect(gate(pro)).toBe('Your Glyphh licence has expired: /workspaces signin to sign in again.')
    expect(limitOf(pro, 'workspaces')).toBe(0)
    expect(access(signedIn(licence('Pro', {}, new Date(NOW).toISOString())), NOW).kind).toBe('expired')
  })
})

describe('the limits, refused with the plan that lifts them', () => {
  test('a count: allowed below the limit, refused at it naming the limit and the next plan that lifts it', () => {
    expect(refusal(FREE, NOW, 'workspaces', 0)).toBeNull()
    expect(refusal(FREE, NOW, 'workspaces', 1)).toBe('Your Free plan allows 1 workspace. Team lifts it: Upgrade in /workspaces.')
    expect(refusal(FREE, NOW, 'favorites', 1)).toBeNull()
    expect(refusal(FREE, NOW, 'favorites', 2)).toBe('Your Free plan allows 2 favourites. Team lifts it: Upgrade in /workspaces.')
  })

  test('a switch: on at 1, refused at 0 naming the plan that has it', () => {
    expect(refusal(FREE, NOW, 'stream')).toBe('The live layout page is not in your Free plan. Pro has it: Upgrade in /workspaces.')
    expect(refusal(signedIn(licence('Pro', { stream: 1 })), NOW, 'stream')).toBeNull()
  })

  test('unlimited is never refused; closed is refused with the gate', () => {
    expect(refusal(signedIn(licence('Pro', { workspaces: null })), NOW, 'workspaces', 10_000)).toBeNull()
    expect(refusal(INITIAL, NOW, 'workspaces', 0)).toBe('Sign in to Glyphh to use Workspaces: /workspaces signin.')
  })

  test('without the plans known, a bigger plan lifts it', () => {
    expect(refusal({ ...FREE, plans: [] }, NOW, 'workspaces', 1)).toBe('Your Free plan allows 1 workspace. A bigger plan lifts it: Upgrade in /workspaces.')
    expect(limitLine('Free', [], 'stream', 0)).toBe('The live layout page is not in your Free plan. A bigger plan has it: Upgrade in /workspaces.')
  })

  test('the lifting plan: the first after the current one whose limit is higher or unlimited', () => {
    expect(liftingPlan(PLANS, 'Free', 'workspaces', 1)).toBe('Team')
    expect(liftingPlan(PLANS, 'Team', 'workspaces', 3)).toBe('Pro')
    expect(liftingPlan(PLANS, 'Free', 'stream', 0)).toBe('Pro')
    expect(liftingPlan(PLANS, 'Pro', 'workspaces', 100)).toBeNull()
    expect(liftingPlan(PLANS, 'Gone', 'workspaces', 1)).toBe('Team') // a plan not listed: from the top
    expect(liftingPlan([{ name: 'Free', mods: {} }, { name: 'Pro', mods: { workspaces: {} } }], 'Free', 'workspaces', 1)).toBeNull()
  })

  test('Upgrade goes to the plan that lifts the limit, else the next plan with Workspaces', () => {
    expect(upgradeTarget(PLANS, 'Free', 'stream', 0)).toBe('Pro')
    expect(upgradeTarget(PLANS, 'Free')).toBe('Team')
    expect(upgradeTarget(PLANS, 'Pro')).toBeNull()
    expect(upgradeTarget(PLANS, null)).toBe('Free')
    expect(upgradeTarget(PLANS, 'Pro', 'workspaces', 5)).toBeNull()
    expect(upgradeTarget([{ name: 'Free', mods: {} }, { name: 'Drips only', mods: { drips: {} } }, { name: 'Pro', mods: { workspaces: {} } }], 'Free')).toBe('Pro')
  })
})

describe("what the page is told: words and limits, never the token", () => {
  test('signed in on Free: the plan, its limits, and the line each refuses with at its limit', () => {
    const s = pageStatus({ ...FREE, note: 'hi', upgrading: { plan: 'Free' } }, NOW)
    expect(s).toEqual({
      kind: 'active',
      plan: 'Free',
      signIn: null,
      isUpgrading: true,
      note: 'hi',
      limits: { workspaces: 1, favorites: 2, stream: 0 },
      refusals: {
        workspaces: 'Your Free plan allows 1 workspace. Team lifts it: Upgrade in /workspaces.',
        favorites: 'Your Free plan allows 2 favourites. Team lifts it: Upgrade in /workspaces.',
        stream: 'The live layout page is not in your Free plan. Pro has it: Upgrade in /workspaces.',
      },
      gate: null,
      offer: null,
      quote: null,
      product: 'Workspaces',
      about: expect.arrayContaining([expect.stringContaining('Workspaces sets up')]),
      command: '/workspaces',
    })
    expect(JSON.stringify(s)).not.toContain('"t"')
  })

  test('signed out while signing in: the code and the page; unlimited has no refusal', () => {
    const s = pageStatus({ ...INITIAL, signIn: { userCode: 'BCDF-GHJK', uri: 'http://x/v1/device' } }, NOW)
    expect(s).toMatchObject({ kind: 'signed-out', plan: null, signIn: { userCode: 'BCDF-GHJK' }, gate: 'Sign in to Glyphh to use Workspaces: /workspaces signin.', limits: { workspaces: 0 } })
    expect(pageStatus(signedIn(licence('Pro', { workspaces: null, favorites: null, stream: 1 })), NOW).refusals).toEqual({ workspaces: null, favorites: null, stream: null })
  })

  test("the page's asks: sign in, cancel, upgrade (to lift a limit of this mod), billing; anything else is passed over", () => {
    for (const a of ['signin', 'cancel', 'upgrade', 'billing', 'addon', 'confirm', 'upgrade:stream', 'upgrade:workspaces']) expect(pageAction(a)).toBe(a)
    for (const a of ['buy', 'copy', 'upgrade:custom_drips', 'upgrade:', 5, null]) expect(pageAction(a)).toBeNull()
  })
})
