import { describe, expect, test } from 'claude-code/testing'

import { DAY_MS, INITIAL, access, daysLeft, refusal, trialText } from '../hooks/licence/access.ts'

const T0 = Date.parse('2026-10-01T09:00:00Z')
const trial = (startedAt: number | null) => ({ ...INITIAL, trialStartedAt: startedAt })

describe('trial maths', () => {
  test('day 0 has all 7 days left', () => {
    expect(daysLeft(T0, T0)).toBe(7)
    expect(daysLeft(T0, T0 + DAY_MS - 1)).toBe(7)
  })

  test('day 6 has 1 day left', () => {
    expect(daysLeft(T0, T0 + 6 * DAY_MS)).toBe(1)
    expect(daysLeft(T0, T0 + 7 * DAY_MS - 1)).toBe(1)
  })

  test('day 7 and after has none', () => {
    expect(daysLeft(T0, T0 + 7 * DAY_MS)).toBe(0)
    expect(daysLeft(T0, T0 + 40 * DAY_MS)).toBe(0)
  })

  test('a clock set back never adds days', () => {
    expect(daysLeft(T0, T0 - 3 * DAY_MS)).toBe(7)
  })

  test('the trial line counts days', () => {
    expect(trialText(7)).toBe('Trial: 7 days left')
    expect(trialText(1)).toBe('Trial: 1 day left')
  })
})

describe('gate', () => {
  test('licensed: open, whatever the trial says', () => {
    const state = { ...trial(T0), licence: 'x.y' }
    expect(access(state, T0 + 30 * DAY_MS)).toEqual({ kind: 'licensed' })
    expect(refusal(state, T0 + 30 * DAY_MS)).toBeNull()
  })

  test('in the trial: open, with the days left', () => {
    expect(access(trial(T0), T0 + 6 * DAY_MS)).toEqual({ kind: 'trial', daysLeft: 1 })
    expect(refusal(trial(T0), T0 + 6 * DAY_MS)).toBeNull()
  })

  test('a trial not yet started counts as its first day', () => {
    expect(access(trial(null), T0)).toEqual({ kind: 'trial', daysLeft: 7 })
  })

  test('after the trial without a licence: refused, pointing to /workspaces', () => {
    expect(access(trial(T0), T0 + 7 * DAY_MS)).toEqual({ kind: 'expired' })
    expect(refusal(trial(T0), T0 + 7 * DAY_MS)).toBe('The Workspaces trial has ended. Unlock it for $5 in /workspaces.')
  })
})
