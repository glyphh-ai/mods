import { describe, expect, test } from 'claude-code/testing'

import { INITIAL, PAGE_ACTIONS, access, pageStatus, refusal } from '../hooks/unlock/access.ts'

const licensed = { ...INITIAL, licence: 'x.y' }

describe('gate', () => {
  test('no trial: locked until it is bought, the refusal pointing to /drips unlock', () => {
    expect(access(INITIAL)).toEqual({ kind: 'locked' })
    expect(refusal(INITIAL)).toBe('Drips is a one-time $8. Run /drips unlock to buy it.')
  })

  test('licensed: open', () => {
    expect(access(licensed)).toEqual({ kind: 'licensed' })
    expect(refusal(licensed)).toBeNull()
  })
})

describe('what the page is told', () => {
  test('the state in words, never the licence', () => {
    const shown = pageStatus({ ...INITIAL, licence: 'secret.key' })
    expect(shown).toMatchObject({ kind: 'licensed' })
    expect(JSON.stringify(shown)).not.toContain('secret.key')
    expect(pageStatus(INITIAL)).toMatchObject({ kind: 'locked', price: '$8', product: 'Drips', command: '/drips' })
    expect(pageStatus({ ...INITIAL, isWaiting: true, note: 'n' })).toMatchObject({ kind: 'locked', isWaiting: true, note: 'n' })
    expect(PAGE_ACTIONS).toEqual(['buy', 'cancel', 'copy'])
  })
})
