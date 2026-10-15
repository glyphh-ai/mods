import { describe, expect, test } from 'claude-code/testing'

import type { AccountState, LicencePayload, PlanInfo } from '../types'
import { access, gate, INITIAL, liftingPlan, limitLine, limitOf, pageAction, pageStatus, refusal, upgradeTarget } from '../hooks/licence/access.ts'
import { INSTALL } from './licences.ts'

const NOW = Date.parse('2026-10-15T09:00:00Z')
const FAR = '2027-01-01T00:00:00Z'
const PAST = '2026-10-01T00:00:00Z'

const PLANS: PlanInfo[] = [
  { name: 'Free', mods: { drips: { custom_drips: 1, fullscreen: 0 } } },
  { name: 'Team', mods: { drips: { custom_drips: 3, fullscreen: 0 } } },
  { name: 'Pro', mods: { drips: { custom_drips: null, fullscreen: 1 } } },
]

const licence = (plan: string, limits: Record<string, number | null> | null, expires = FAR): LicencePayload => ({
  install_id: INSTALL,
  user_id: 'u',
  org_id: 'o',
  plan,
  mods: limits ? { drips: { limits }, workspaces: { limits: {} } } : { workspaces: { limits: {} } },
  expires_at: expires,
})

const signedIn = (l: LicencePayload | null, plans = PLANS): AccountState => ({ ...INITIAL, install: { install_id: INSTALL, token: 't' }, licence: l, fetchedAt: NOW, plans })

const FREE = signedIn(licence('Free', { custom_drips: 1, fullscreen: 0 }))

describe('what the plan allows Drips', () => {
  test('signed out without an install or a licence', () => {
    expect(access(INITIAL, NOW)).toEqual({ kind: 'signed-out' })
    expect(access({ ...INITIAL, install: { install_id: INSTALL, token: 't' } }, NOW)).toEqual({ kind: 'signed-out' })
    expect(gate(access(INITIAL, NOW))).toBe('Sign in to Glyphh to use Drips: /drips signin.')
  })

  test('in the plan: its limits; a name the plan leaves out is 0, null is unlimited', () => {
    const a = access(signedIn(licence('Pro', { custom_drips: null })), NOW)
    expect(a).toEqual({ kind: 'active', plan: 'Pro', limits: { custom_drips: null } })
    expect(limitOf(a, 'custom_drips')).toBeNull()
    expect(limitOf(a, 'fullscreen')).toBe(0)
    expect(gate(a)).toBeNull()
    expect(limitOf(access(signedIn({ ...licence('Pro', null), mods: { drips: {} } }), NOW), 'custom_drips')).toBe(0)
  })

  test('not in the plan: closed, with Upgrade', () => {
    const a = access(signedIn(licence('Free', null)), NOW)
    expect(a).toEqual({ kind: 'not-in-plan', plan: 'Free' })
    expect(gate(a)).toBe('Drips is not in your Free plan. Upgrade in /drips.')
  })

  test('expired: Free keeps its limits; any other plan closes until signed in again', () => {
    const free = access(signedIn(licence('Free', { custom_drips: 1 }, PAST)), NOW)
    expect(free).toEqual({ kind: 'expired', plan: 'Free', limits: { custom_drips: 1 } })
    expect(gate(free)).toBeNull()
    const pro = access(signedIn(licence('Pro', { custom_drips: null }, PAST)), NOW)
    expect(gate(pro)).toBe('Your Glyphh licence has expired: /drips signin to sign in again.')
    expect(limitOf(pro, 'custom_drips')).toBe(0)
  })
})

describe('the limits, refused with the plan that lifts them', () => {
  test('saved drips: allowed below the limit, refused at it naming the next plan that lifts it', () => {
    expect(refusal(FREE, NOW, 'custom_drips', 0)).toBeNull()
    expect(refusal(FREE, NOW, 'custom_drips', 1)).toBe('Your Free plan allows 1 saved drip. Team lifts it: Upgrade in /drips.')
    expect(refusal({ ...FREE, plans: [] }, NOW, 'custom_drips', 1)).toBe('Your Free plan allows 1 saved drip. A bigger plan lifts it: Upgrade in /drips.')
  })

  test('fullscreen: on at 1, refused at 0 naming the plan that has it', () => {
    expect(refusal(FREE, NOW, 'fullscreen')).toBe('Fullscreen is not in your Free plan. Pro has it: Upgrade in /drips.')
    expect(refusal(signedIn(licence('Pro', { fullscreen: 1 })), NOW, 'fullscreen')).toBeNull()
    expect(limitLine('Free', [], 'fullscreen', 0)).toBe('Fullscreen is not in your Free plan. A bigger plan has it: Upgrade in /drips.')
  })

  test('the lifting plan and the Upgrade target', () => {
    expect(liftingPlan(PLANS, 'Free', 'custom_drips', 1)).toBe('Team')
    expect(liftingPlan(PLANS, 'Free', 'fullscreen', 0)).toBe('Pro')
    expect(liftingPlan(PLANS, 'Pro', 'custom_drips', 9)).toBeNull()
    expect(upgradeTarget(PLANS, 'Free', 'fullscreen', 0)).toBe('Pro')
    expect(upgradeTarget(PLANS, 'Free')).toBe('Team')
    expect(upgradeTarget(PLANS, 'Pro')).toBeNull()
  })
})

describe('what the page is told: words and limits, never the token', () => {
  test('signed in on Free: the plan, its limits and the lines', () => {
    expect(pageStatus(FREE, NOW)).toEqual({
      kind: 'active',
      plan: 'Free',
      signIn: null,
      isUpgrading: false,
      note: null,
      limits: { custom_drips: 1, fullscreen: 0 },
      refusals: { custom_drips: 'Your Free plan allows 1 saved drip. Team lifts it: Upgrade in /drips.', fullscreen: 'Fullscreen is not in your Free plan. Pro has it: Upgrade in /drips.' },
      gate: null,
      product: 'Drips',
      about: expect.arrayContaining([expect.stringContaining('Drips plays visual effects')]),
      command: '/drips',
    })
  })

  test("the page's asks: limits of this mod only", () => {
    for (const a of ['signin', 'cancel', 'upgrade', 'billing', 'upgrade:fullscreen', 'upgrade:custom_drips']) expect(pageAction(a)).toBe(a)
    for (const a of ['buy', 'copy', 'upgrade:stream', 'upgrade:', 5]) expect(pageAction(a)).toBeNull()
  })
})
