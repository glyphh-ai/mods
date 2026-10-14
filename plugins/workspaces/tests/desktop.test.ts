import { describe, expect, test } from 'claude-code/testing'

import { applyWorkspace, findFile, openPage, showFile, togglePane } from '../hooks/workspaces/desktop.ts'
import { blankFile } from '../hooks/workspaces/model.ts'
import type { WorkspaceFile } from '../types'
import { fakeApp } from './fakes.ts'

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

const ws = (over: Partial<WorkspaceFile>): WorkspaceFile => ({ ...blankFile('W'), ...over })

describe('View menu panes', () => {
  test('shown, hidden, or already so', async () => {
    const f = fakeApp()
    expect(await togglePane(f.app, 'files', true)).toBe('Files open')
    expect(await togglePane(f.app, 'files', true)).toBe('Files already open')
    expect(await togglePane(f.app, 'files', false)).toBe('Files closed')
    expect(await togglePane(f.app, 'terminal', false)).toBe('Terminal already closed')
  })

  test('without Accessibility permission the menu says why', async () => {
    const f = fakeApp()
    f.world.menuFails = true
    await expect(togglePane(f.app, 'files', true)).rejects.toThrow('not allowed assistive access')
  })
})

describe('applying a workspace', () => {
  test('closes the panes it does not list, opens the rest in order, and reports each', async () => {
    const f = fakeApp()
    f.open.add('Browser')
    f.open.add('Changes')
    const report = await applyWorkspace(f.app, ws({ desktop_panes: ['terminal', 'changes', 'files'], collapse_sidebar: true }))
    expect(report).toBe('Terminal ✓ · Changes ✓ · Files ✓')
    expect(f.calls.filter(c => c.startsWith('menu'))).toEqual(['menu Hide Browser', 'menu Show Terminal', 'menu Show Files'])
    expect(f.calls[0]).toBe('ccd_window.set_sidebar_collapsed {"collapsed":true}')
  })

  test('the editor pane opens the file /editor last showed, if any', async () => {
    const f = fakeApp()
    expect(await applyWorkspace(f.app, ws({ desktop_panes: ['editor'] }))).toBe('')
    await f.openFile.set(() => '/proj/a.ts')
    expect(await applyWorkspace(f.app, ws({ desktop_panes: ['editor'] }))).toBe('Editor ✓')
    expect(f.calls).toContain('ccd_view.show_pane {"pane":"file","path":"/proj/a.ts"}')
  })

  test('a View menu it cannot read, or a pane it cannot click, is reported', async () => {
    const f = fakeApp()
    f.world.menuFails = true
    expect(await applyWorkspace(f.app, ws({ desktop_panes: ['files'] }))).toBe('panes ✗ the View menu: not allowed assistive access')
    f.world.menuFails = false
    f.world.clickFails.add('Files')
    expect(await applyWorkspace(f.app, ws({ desktop_panes: ['files', 'terminal'] }))).toBe('Show Files ✗ cannot click Files · Terminal ✓')
  })

  test('tabs: the Browser pane shown, each page in a tab of its own, the first in front', async () => {
    const f = fakeApp()
    const comms = ws({ name: 'Comms', tabs: [{ url: 'https://mail.google.com', name: 'Gmail' }, { url: 'https://app.slack.com', name: 'Slack' }] })
    expect(await applyWorkspace(f.app, comms)).toBe('Browser ✓')
    expect(f.tabs.map(t => t.origin)).toEqual(['https://app.slack.com', 'https://mail.google.com'])
    expect(f.paneTabs.now()).toEqual({ 'Comms#1': 't1', 'Comms#0': 't2' })

    const before = f.tabs.length
    await applyWorkspace(f.app, comms) // known tabs are selected, not opened again
    expect(f.tabs.length).toBe(before)
    expect(f.calls.at(-1)).toBe('Claude_Browser.tabs_select {"tabId":"t2"}')
  })

  test('a tab closed since is found again on its site, or opened anew', async () => {
    const f = fakeApp()
    f.tabs.push({ tabId: 'mine', origin: 'https://mail.google.com' })
    await f.paneTabs.set(() => ({ 'Comms#0': 'gone' }))
    await applyWorkspace(f.app, ws({ name: 'Comms', tabs: [{ url: 'https://mail.google.com/u/0', name: 'Gmail' }] }))
    expect(f.paneTabs.now()).toEqual({ 'Comms#0': 'mine' })

    f.world.contextFails = true
    await f.paneTabs.set(() => ({}))
    await applyWorkspace(f.app, ws({ name: 'Cal', tabs: [{ url: 'https://calendar.google.com', name: 'Calendar' }] }))
    expect(f.paneTabs.now()).toEqual({ 'Cal#0': 't1' })
  })

  test('where the app refuses the mod opening pages, Claude is asked to', async () => {
    const f = fakeApp()
    f.world.browserRefuses = true
    await applyWorkspace(f.app, ws({ name: 'Comms', tabs: [{ url: 'https://mail.google.com', name: 'Gmail' }] }))
    expect(f.asked).toEqual(['Open these in the browser pane as tabs, the first one in front (workspace "Comms"): https://mail.google.com'])
  })

  test('the session moves to the folder, unless it is there; a refusal is said', async () => {
    const f = fakeApp()
    await applyWorkspace(f.app, ws({ folder: '/proj' }))
    await applyWorkspace(f.app, ws({ folder: '/code' }))
    await settle()
    expect(f.toasts).toEqual(['The session moves to /code'])
    f.world.folderAnswer = 'error'
    await applyWorkspace(f.app, ws({ folder: '/code' }))
    f.world.folderAnswer = 'throw'
    await applyWorkspace(f.app, ws({ folder: '/code' }))
    await settle()
    expect(f.toasts.slice(1)).toEqual(['Folder not moved: not allowed', 'Folder not moved: unreachable'])
  })
})

describe('single panes', () => {
  test('a page opens in the Browser pane', async () => {
    const f = fakeApp()
    await openPage(f.app, 'https://example.com')
    expect(f.open.has('Browser')).toBe(true)
    expect(f.tabs).toEqual([{ tabId: 't1', origin: 'https://example.com' }])
    f.world.browserRefuses = true
    await expect(openPage(f.app, 'https://example.com')).rejects.toThrow('refused')
    f.world.browserRefuses = false
    f.world.browserSilent = true
    await expect(openPage(f.app, 'https://example.com')).rejects.toThrow('preview_start failed')
  })

  test('a file shows in the Files pane', async () => {
    const f = fakeApp()
    await showFile(f.app, '/proj/a.ts')
    expect(f.calls).toEqual(['ccd_view.show_pane {"pane":"file","path":"/proj/a.ts"}'])
  })

  test('a file is found by path, or by name under the session folder', async () => {
    const f = fakeApp()
    f.files.add('/proj/README.md')
    expect(await findFile(f.app, 'README.md')).toEqual(['/proj/README.md'])
    f.world.findOut = '/proj/a/x.ts\n/proj/b/x.ts\n'
    expect(await findFile(f.app, 'x.ts')).toEqual(['/proj/a/x.ts', '/proj/b/x.ts'])
    expect(await findFile(f.app, 'b/x.ts')).toEqual(['/proj/b/x.ts'])
    f.world.findFails = true
    expect(await findFile(f.app, '/elsewhere/y.ts')).toEqual([])
  })
})
