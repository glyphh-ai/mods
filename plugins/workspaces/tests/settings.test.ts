import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { ICONS_PER_PAGE, settingsOf } from '../hooks/workspaces/settings.ts'
import { T0, runCommand, startSession, world } from './engine.ts'

async function started($: Engine, on: On) {
  mock.store(on)
  mock.clock(on, { now: T0 })
  const w = world(on)
  await startSession($)
  return { ...w, run: (command: string, args?: string) => runCommand($, command, args) }
}

describe("settings in Claude's own /config", () => {
  test('the defaults: the wall, the dock on and hiding behind cards, 40 icons a page', () => {
    expect(settingsOf({})).toEqual({ home: 'wall', dock: true, dockAutoHide: true, iconsPerPage: 40 })
    expect(ICONS_PER_PAGE).toEqual(['24', '40', '56'])
  })

  test('each picker read; a value outside its options takes the default', () => {
    expect(settingsOf({ home: 'last workspace', dock: 'off', dockAutoHide: 'off', iconsPerPage: '56' })).toEqual({ home: 'last workspace', dock: false, dockAutoHide: false, iconsPerPage: 56 })
    expect(settingsOf({ home: 'elsewhere', dock: true, dockAutoHide: 'maybe', iconsPerPage: '41' })).toEqual({ home: 'wall', dock: true, dockAutoHide: true, iconsPerPage: 40 })
  })

  test('the manifest defaults reach the layout page', async ($, on) => {
    const { run, helper } = await started($, on)
    await run('dip', 'Comms')
    expect(helper.layouts[0]?.settings).toEqual({ home: 'wall', dock: true, dockAutoHide: true, iconsPerPage: 40 })
  })

  test('the values set in /config reach the layout page', { options: { home: 'last workspace', dock: 'off', dockAutoHide: 'off', iconsPerPage: '24' } }, async ($, on) => {
    const { run, helper } = await started($, on)
    await run('dip', 'Comms')
    expect(helper.layouts[0]?.settings).toEqual({ home: 'last workspace', dock: false, dockAutoHide: false, iconsPerPage: 24 })
  })
})
