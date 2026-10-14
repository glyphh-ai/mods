// What the licence allows now: licensed, a trial with days left, or neither.
import type { LicenceState } from '../../types'
import { MOD, PRICE, PRODUCT, TRIAL_DAYS } from './config.ts'

export const DAY_MS = 86_400_000

export type Access = { kind: 'licensed' } | { kind: 'trial'; daysLeft: number } | { kind: 'expired' }

export const INITIAL: LicenceState = { licence: null, trialStartedAt: null, isWaiting: false, note: null }

/** Whole days of the trial left at `now`: 7 on its first day, 0 once over. */
export function daysLeft(startedAt: number, now: number): number {
  const used = Math.floor(Math.max(0, now - startedAt) / DAY_MS)
  return Math.max(0, TRIAL_DAYS - used)
}

/** A trial not yet started (this session's start has not run) counts as day 0. */
export function access(state: LicenceState, now: number): Access {
  if (state.licence) return { kind: 'licensed' }
  const left = daysLeft(state.trialStartedAt ?? now, now)
  return left > 0 ? { kind: 'trial', daysLeft: left } : { kind: 'expired' }
}

/** The line a gated command answers with once the trial is over; null while it may run. */
export function refusal(state: LicenceState, now: number): string | null {
  return access(state, now).kind === 'expired'
    ? `The ${PRODUCT} trial has ended. Unlock it for ${PRICE} in /${MOD}.`
    : null
}

export const trialText = (days: number) => `Trial: ${days} day${days === 1 ? '' : 's'} left`
