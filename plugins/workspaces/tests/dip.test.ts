import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'

async function started($: Engine, on: On, options?: WorldOptions) {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  return { ...w, clock, run: { command: (command: string, args?: string) => runCommand($, command, args) } }
}

describe('/dip', () => {
  test('lists the workspaces, switches by number, name and prefix, and back bounces', async ($, on) => {
    const { run, open, mcp, w } = await started($, on)
    expect(await run.command('dip')).toBe('Workspaces: 1 Comms · 2 IDE · 3 Browse · 4 Files')
    expect(await run.command('dip', 'back')).toBe('No workspace to go back to yet.')
    expect(await run.command('dip', '1')).toBe('→ Comms  Browser ✓')
    expect(mcp).toContain('Claude_Browser.preview_start')
    expect(await run.command('dip', 'ide')).toBe('→ IDE  Terminal ✓ · Changes ✓ · Files ✓')
    expect([...open]).toEqual(['Terminal', 'Changes', 'Files'])
    expect(await run.command('dip', 'back')).toStartWith('→ Comms')
    expect(await run.command('dip', 'back')).toStartWith('→ IDE')
    expect(await run.command('dip', 'Bro')).toStartWith('→ Browse')
    expect(await run.command('dip', 'Browse')).toStartWith('→ Browse')
    expect(await run.command('dip', 'back')).toStartWith('→ IDE')
    expect(await run.command('dip', 'nope')).toBe('No workspace "nope". Workspaces: 1 Comms · 2 IDE · 3 Browse · 4 Files')
    expect(await run.command('dip', '9')).toStartWith('No workspace "9"')
    expect(w.closed).toContain('workspaces')
  })

  test('drives the desktop app only', async ($, on) => {
    const { run } = await started($, on, { surfaces: ['terminal'] })
    expect(await run.command('dip', 'IDE')).toBe('Workspaces drives the Claude desktop app: run this in a desktop app session.')
    expect(await run.command('files')).toBe('Workspaces drives the Claude desktop app: run this in a desktop app session.')
  })

  test('with no workspaces says how to make one', async ($, on) => {
    const { run, files } = await started($, on)
    for (const k of [...files.keys()]) files.delete(k)
    files.set('/home/t/.glyphh/workspaces/.keep', '')
    await startSession($)
    expect(await run.command('dip')).toBe('No workspaces yet: /workspaces makes one.')
  })
})

describe('/dip on the desktop', () => {
  test('where the app refuses the mod opening pages, Claude is asked to open them', async ($, on) => {
    const { run, asked, clock } = await started($, on, { browserRefuses: true })
    expect(await run.command('dip', 'Comms')).toBe('→ Comms  Browser ✓')
    expect(asked).toEqual([])
    await clock.settle()
    expect(asked).toEqual([
      'Open these in the browser pane as tabs, the first one in front (workspace "Comms"): https://mail.google.com, https://app.slack.com, https://calendar.google.com',
    ])
  })

  test('where Claude cannot be asked either, a toast says what to allow', async ($, on) => {
    const { run, toasts, clock } = await started($, on, { browserRefuses: true, promptFails: true })
    await run.command('dip', 'Browse')
    await clock.settle()
    expect(toasts).toContain('The Browser pane is not available: allow mcp__Claude_Browser__preview_start')
  })

  test('workspaces already on disk are read in name order when no order is kept', async ($, on) => {
    const dir = '/home/t/.glyphh/workspaces'
    const seed = { [`${dir}/zed.json`]: JSON.stringify({ name: 'Zed' }), [`${dir}/alpha.json`]: JSON.stringify({ name: 'Alpha' }) }
    mock.store(on, { workspaceOrder: 'not a list' })
    mock.clock(on, { now: T0 })
    world(on, { seed })
    await startSession($)
    expect(await runCommand($, 'dip')).toBe('Workspaces: 1 Alpha · 2 Zed')
  })
})

describe('pane commands', () => {
  test('show and hide panes, open a page, open a file', async ($, on) => {
    const { run, open, files, w } = await started($, on)
    expect(await run.command('files')).toBe('Files open')
    expect(await run.command('files', 'off')).toBe('Files closed')
    expect(await run.command('diff')).toBe('Changes open')
    expect(await run.command('term')).toBe('Terminal open')
    expect(await run.command('browser')).toBe('Browser open')
    expect(await run.command('browser', 'example.com')).toBe('Browser: https://example.com')
    expect(open.has('Browser')).toBe(true)
    expect(await run.command('editor')).toBe('Which file? /editor <path or name>')
    expect(await run.command('editor', 'missing.ts')).toBe('No file "missing.ts" under /proj')
    files.set('/proj/README.md', '# hi')
    expect(await run.command('editor', 'README.md')).toBe('Editor: /proj/README.md')
    w.find = '/proj/a/x.ts\n/proj/b/x.ts\n'
    expect(await run.command('editor', 'x.ts')).toBe('Several match, say which:\n/proj/a/x.ts\n/proj/b/x.ts')
  })

  test('a name Claude Code already has goes to the other name; a command not ours passes by', async ($, on) => {
    const { run, commands } = await started($, on, { taken: { diff: 'the built-in diff', edit: 'the built-in edit', editor: 'the built-in editor' } })
    expect(commands).toContain('changes')
    expect(commands).not.toContain('edit')
    expect(await run.command('changes')).toBe('Changes open')
    expect(await run.command('diff')).toBe('the built-in diff')
  })

  test('a pane command that fails says why', async ($, on) => {
    const { run } = await started($, on, { menuFails: true })
    expect(await run.command('term')).toBe('/term: no access')
  })
})

describe('/workspaces', () => {
  test('opens the pane; says when it cannot be placed; other words get the usage', async ($, on) => {
    const { run, w } = await started($, on)
    expect(await run.command('workspaces')).toBe('Workspaces open.')
    w.isPlaced = false
    expect(await run.command('workspaces')).toBe('The Workspaces pane could not be placed: no-surface')
    expect(await run.command('workspaces', 'hello')).toBe('Usage: /workspaces [key <licence>]')
  })
})
