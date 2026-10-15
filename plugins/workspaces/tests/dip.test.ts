import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { CHROME, DIR, T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'

async function started($: Engine, on: On, options?: WorldOptions, store?: Record<string, unknown>) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  return { ...w, clock, run: (command: string, args?: string) => runCommand($, command, args) }
}

describe('/dip', () => {
  test('lists the workspaces, switches by number, name and prefix, and back bounces', async ($, on) => {
    const { run, open } = await started($, on)
    expect(await run('dip')).toBe('Workspaces: 1 Comms · 2 IDE · 3 Browse · 4 Files')
    expect(await run('dip', 'back')).toBe('No workspace to go back to yet.')
    expect(await run('dip', '1')).toBe('→ Comms  Browser ✓ · layout page ✓')
    expect(await run('dip', 'ide')).toBe('→ IDE  Terminal ✓ · Files ✓ · Changes ✓')
    expect([...open]).toEqual(['Terminal', 'Files', 'Changes'])
    expect(await run('dip', 'back')).toStartWith('→ Comms')
    expect(await run('dip', 'back')).toStartWith('→ IDE')
    expect(await run('dip', 'Bro')).toStartWith('→ Browse')
    expect(await run('dip', 'back')).toStartWith('→ IDE')
    expect(await run('dip', 'nope')).toBe('No workspace "nope". Workspaces: 1 Comms · 2 IDE · 3 Browse · 4 Files')
    expect(await run('dip', '9')).toStartWith('No workspace "9"')
  })

  test('the first switch with pages starts the helper and opens the layout page once, by a one-time address', async ($, on) => {
    const { run, helper, mcp } = await started($, on)
    await run('dip', 'Comms')
    expect(helper.started).toEqual([['node', expect.stringMatching(/\/helper\/viewer\.mjs$/)]])
    expect(helper.env[0]).toMatchObject({ WORKSPACES_DETACH: '1', WORKSPACES_PORT: expect.stringMatching(/^\d+$/), WORKSPACES_TOKEN: expect.stringMatching(/^[0-9a-f]{48}$/) })
    expect(helper.layouts[0]?.active).toBe('Comms')
    expect(helper.layouts[0]?.layouts.map(l => l.name)).toEqual(['Comms', 'IDE', 'Browse', 'Files'])
    expect(mcp.filter(c => c === 'Claude_Browser.preview_start')).toHaveLength(1)

    helper.open = 1 // the page is on screen now: a switch happens inside it
    expect(await run('dip', 'Browse')).toBe('→ Browse  Browser ✓ · layout page ✓')
    expect(helper.layouts.at(-1)?.active).toBe('Browse')
    expect(mcp.filter(c => c === 'Claude_Browser.preview_start')).toHaveLength(1)
    expect(helper.started).toHaveLength(1)

    await run('dip', 'IDE') // no pages: the open layout page follows along
    expect(helper.layouts.at(-1)?.active).toBe('IDE')
  })

  test('the layout page closed: its old tab goes, a new one opens', async ($, on) => {
    const { run, mcp } = await started($, on)
    await run('dip', 'Comms')
    await run('dip', 'Browse')
    expect(mcp.filter(c => c.startsWith('Claude_Browser'))).toEqual(['Claude_Browser.preview_start', 'Claude_Browser.tabs_close', 'Claude_Browser.preview_start'])
  })

  test('where the app refuses the mod opening the page, Claude is asked to open the one address', async ($, on) => {
    const { run, asked, clock, helper } = await started($, on, { browserRefuses: true })
    expect(await run('dip', 'Comms')).toBe('→ Comms  Browser ✓ · layout page: Claude is asked to open it')
    expect(asked).toEqual([])
    await clock.settle()
    expect(asked).toEqual([`Open this page in the browser pane (it opens once): http://127.0.0.1:${helper.alive?.port}/?k=once`])
    expect(asked[0]).not.toContain(helper.alive!.token)
  })

  test('where Claude cannot be asked either, a toast says what to allow', async ($, on) => {
    const { run, toasts, clock } = await started($, on, { browserRefuses: true, promptFails: true })
    await run('dip', 'Browse')
    await clock.settle()
    expect(toasts).toContain('The Browser pane is not available: allow mcp__Claude_Browser__preview_start')
  })

  test('without Chrome and Node the layout page says what to install', async ($, on) => {
    const { run, helper } = await started($, on, { noChrome: true, noNode: true })
    expect(await run('dip', 'Comms')).toBe(
      '→ Comms  Browser ✓ · The layout page needs Google Chrome (https://www.google.com/chrome/) and Node.js 18 or newer (https://nodejs.org). Install them, then start a new session.',
    )
    expect(helper.started).toEqual([])
  })

  test('a helper that never comes up is tried twice, then said', async ($, on) => {
    const { run, helper, clock } = await started($, on, { helperFails: true })
    const said = run('dip', 'Comms')
    await clock.advance(5000)
    expect(await said).toBe('→ Comms  Browser ✓ · layout page ✗ the layout page did not start')
    expect(helper.started).toHaveLength(2)
  })

  test('a reload finds the running helper again; one with other code is told to leave and replaced', async ($, on) => {
    const { run, helper, files } = await started($, on)
    await run('dip', 'Comms')
    await startSession($) // a reload: session.start runs again
    await run('dip', 'Browse')
    expect(helper.started).toHaveLength(1)
    const viewer = helper.started[0]![1]!
    files.set(viewer, 'changed code')
    await startSession($)
    expect(helper.quits).toBe(1)
    await run('dip', 'Comms')
    expect(helper.started).toHaveLength(2)
  })

  test('a helper gone away is let go, and the next switch starts another', async ($, on) => {
    const { run, helper, clock } = await started($, on)
    await run('dip', 'Comms')
    helper.alive = null
    await clock.advance(1000)
    await run('dip', 'Browse')
    expect(helper.started).toHaveLength(2)
  })

  test('drives the desktop app only', async ($, on) => {
    const { run } = await started($, on, { surfaces: ['terminal'] })
    const said = 'Workspaces drives the Claude desktop app: run this in a desktop app session.'
    expect(await run('dip', 'IDE')).toBe(said)
    expect(await run('stream')).toBe(said)
    expect(await run('files')).toBe(said)
  })

  test('with no workspaces says how to make one', async ($, on) => {
    const { run } = await started($, on, { seed: { [`${DIR}/.keep`]: '' } })
    expect(await run('dip')).toBe('No workspaces yet: /workspaces makes one.')
    expect(await run('stream')).toBe('No workspaces yet: /workspaces makes one.')
  })

  test('workspaces on disk are read in name order when no order is kept', async ($, on) => {
    const seed = {
      [`${DIR}/zed.json`]: JSON.stringify({ name: 'Zed', cols: 1, rows: 1, cells: [] }),
      [`${DIR}/alpha.json`]: JSON.stringify({ name: 'Alpha', cols: 1, rows: 1, cells: [] }),
    }
    const { run } = await started($, on, { seed }, { workspaceOrder: 'not a list' })
    expect(await run('dip')).toBe('Workspaces: 1 Alpha · 2 Zed')
  })
})

describe('/stream and the layout page', () => {
  test('/stream opens the layout page on the open workspace, or the one named', async ($, on) => {
    const { run, helper } = await started($, on)
    expect(await run('stream')).toBe('Comms: layout page ✓')
    expect(await run('stream', 'brow')).toBe('Browse: layout page ✓')
    expect(helper.layouts.at(-1)?.active).toBe('Browse')
    expect(await run('dip', 'back')).toStartWith('→ Comms')
    expect(await run('stream', 'nope')).toStartWith('No workspace "nope"')
  })

  test('a shape dragged in the page is saved to the workspace file; a layout picked there becomes the open one', async ($, on) => {
    const { run, helper, json, clock } = await started($, on)
    await run('stream', 'Comms')
    helper.say({ t: 'layout', name: 'Comms', colWidths: [0.7, 0.3], rowHeights: [0.5, 0.5] })
    helper.say({ t: 'active', name: 'IDE' })
    helper.say({ t: 'active', name: 'IDE' })
    helper.say({ t: 'noise' })
    await clock.advance(1000)
    expect(json('comms').col_widths).toEqual([0.7, 0.3])
    expect(await run('dip', 'back')).toStartWith('→ Comms')
  })

  test("the editor's saves are read again and sent back to the page; a rename keeps its place and follows the open workspace", async ($, on) => {
    const { run, helper, files, clock } = await started($, on)
    await run('dip', 'Comms')
    files.set(`${DIR}/mail.json`, files.get(`${DIR}/comms.json`)!.replace('"Comms"', '"Mail"'))
    files.delete(`${DIR}/comms.json`)
    helper.say({ t: 'library', renamed: { from: 'comms', to: 'mail', name: 'Mail', was: 'Comms' } })
    await clock.advance(1000)
    expect(await run('dip')).toBe('Workspaces: 1 Mail · 2 IDE · 3 Browse · 4 Files')
    expect(helper.layouts.at(-1)?.active).toBe('Mail')
    expect(helper.layouts.at(-1)?.library.workspaces.map(w => w.slug)).toEqual(['mail', 'ide', 'browse', 'files'])
    files.delete(`${DIR}/files.json`)
    helper.say({ t: 'library' })
    await clock.advance(1000)
    expect(await run('dip')).toBe('Workspaces: 1 Mail · 2 IDE · 3 Browse')
  })

  test("a workspace's model and effort are set for this session after the switch; the editor is offered the session's models", async ($, on) => {
    const seed = { [`${DIR}/deep.json`]: JSON.stringify({ name: 'Deep', model: 'sonnet', effort: 'high', cols: 1, rows: 1, cells: [{ panel: 'files', col: 0, row: 0 }] }) }
    const { run, slash, toasts, clock, helper } = await started($, on, { seed })
    expect(await run('dip', 'Deep')).toBe('→ Deep  Files ✓ · model sonnet · effort high')
    expect(slash).toEqual([])
    await clock.settle()
    expect(slash).toEqual(['/model sonnet', '/effort high'])
    expect(toasts).toContain('Set model to sonnet (this session only)')
    await run('stream')
    expect(helper.layouts.at(-1)?.library.choices).toEqual({ models: ['default', 'sonnet', 'opus'], efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] })
  })

  test('the helper is told where ~/.glyphh is', async ($, on) => {
    const { run, helper } = await started($, on)
    await run('stream')
    expect(helper.env[0]).toMatchObject({ WORKSPACES_CHROME: CHROME, WORKSPACES_LIBRARY: '/home/t/.glyphh', WORKSPACES_VERSION: expect.stringMatching(/^[0-9a-f]{16}$/) })
  })

  test('a shape for a workspace gone from disk is said, not thrown', async ($, on) => {
    const { run, helper, toasts, clock } = await started($, on)
    await run('stream', 'Comms')
    helper.say({ t: 'layout', name: 'Gone', colWidths: [1], rowHeights: [1] })
    await clock.advance(1000)
    expect(toasts).toContain('Workspaces: Error: There is no workspace "Gone".')
  })

  test('Chrome and Node are found where they are installed', async ($, on) => {
    const { run, helper } = await started($, on)
    await run('stream')
    expect(helper.started[0]?.[0]).toBe('node')
    expect(CHROME).toEndWith('Google Chrome')
  })
})

describe('page_read', () => {
  test('lists the open pages by favourite, and reads one by name or id', async ($, on) => {
    const { run } = await started($, on)
    const read = async (input: object) => ((await $.tool.call({ tool: 'mcp__workspaces__page_read', input } as never)) as { result?: unknown }).result
    expect(await read({})).toEqual({ error: 'The layout page is not running: open it with /stream.' })
    await run('stream')
    expect(await read({})).toEqual({ pages: [{ page: 'gmail', name: 'Gmail', url: 'https://mail.google.com/mail', title: 'Inbox' }] })
    expect(await read({ page: 'gmail' })).toEqual({ cell: 'gmail', text: 'Inbox (3)' })
    expect(await read({ page: 'Calendar' })).toEqual({ cell: 'calendar', text: 'Inbox (3)' })
  })
})

describe('pane commands', () => {
  test('show and hide panes, open a page, open a file', async ($, on) => {
    const { run, open, files, w } = await started($, on)
    expect(await run('files')).toBe('Files open')
    expect(await run('files', 'off')).toBe('Files closed')
    expect(await run('diff')).toBe('Changes open')
    expect(await run('term')).toBe('Terminal open')
    expect(await run('browser')).toBe('Browser open')
    expect(await run('browser', 'example.com')).toBe('Browser: https://example.com')
    expect(open.has('Browser')).toBe(true)
    expect(await run('editor')).toBe('Which file? /editor <path or name>')
    expect(await run('editor', 'missing.ts')).toBe('No file "missing.ts" under /proj')
    files.set('/proj/README.md', '# hi')
    expect(await run('editor', 'README.md')).toBe('Editor: /proj/README.md')
    w.find = '/proj/a/x.ts\n/proj/b/x.ts\n'
    expect(await run('editor', 'x.ts')).toBe('Several match, say which:\n/proj/a/x.ts\n/proj/b/x.ts')
  })

  test('a name Claude Code already has goes to the other name; a command not ours passes by', async ($, on) => {
    const { run, commands } = await started($, on, { taken: { diff: 'the built-in diff', edit: 'the built-in edit', editor: 'the built-in editor' } })
    expect(commands).toContain('changes')
    expect(commands).not.toContain('edit')
    expect(await run('changes')).toBe('Changes open')
    expect(await run('diff')).toBe('the built-in diff')
  })

  test('a pane command that fails says why', async ($, on) => {
    const { run } = await started($, on, { menuFails: true })
    expect(await run('term')).toBe('/term: no access')
  })
})

describe('/workspaces', () => {
  test('opens the layout page on its workspace editor, in one line; an open page is switched to it', async ($, on) => {
    const { run, helper, mcp } = await started($, on)
    expect(await run('workspaces')).toBe('Workspaces: layout page ✓')
    expect(mcp.filter(c => c === 'Claude_Browser.preview_start')).toHaveLength(1)
    helper.open = 1
    expect(await run('workspaces')).toBe('Workspaces: layout page ✓')
    expect(helper.shown).toEqual(['workspaces'])
    expect(mcp.filter(c => c === 'Claude_Browser.preview_start')).toHaveLength(1)
  })

  test('where the app refuses, Claude is asked to open the editor page by its one-time address', async ($, on) => {
    const { run, asked, clock, helper } = await started($, on, { browserRefuses: true })
    expect(await run('workspaces')).toBe('Workspaces: layout page: Claude is asked to open it')
    await clock.settle()
    expect(asked).toEqual([`Open this page in the browser pane (it opens once): http://127.0.0.1:${helper.alive?.port}/?k=once&view=workspaces`])
    expect(asked[0]).not.toContain(helper.alive!.token)
  })

  test('says what the layout page lacks, outside the desktop app says so, and other words get the usage', async ($, on) => {
    const { run } = await started($, on, { noNode: true })
    expect(await run('workspaces')).toBe('Workspaces: The layout page needs Node.js 18 or newer (https://nodejs.org). Install it, then start a new session.')
    expect(await run('workspaces', 'hello')).toBe('Usage: /workspaces [key <licence>]')
  })

  test('outside the desktop app it says so', async ($, on) => {
    const { run } = await started($, on, { surfaces: ['terminal'] })
    expect(await run('workspaces')).toBe('Workspaces drives the Claude desktop app: run this in a desktop app session.')
  })

  test('with HOME unknown a toast says there is nowhere to keep workspaces', async ($, on) => {
    const { toasts } = await started($, on, { home: null })
    expect(toasts).toContain('Workspaces: HOME is not set: there is nowhere to keep workspaces.')
  })
})
