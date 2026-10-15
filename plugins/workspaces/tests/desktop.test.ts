import { describe, expect, test } from 'claude-code/testing'

import { applyWorkspace, closeTab, findFile, openPage, openTab, panesOf, showFile, togglePane } from '../hooks/workspaces/desktop.ts'
import type { FileCell, WorkspaceFile } from '../types'
import { fakeApp } from './fakes.ts'

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

const ws = (cells: FileCell[], folder: string | null = null, model: string | null = null, effort: string | null = null): WorkspaceFile => ({ name: 'W', folder, model, effort, cols: 2, rows: 2, col_widths: [0.5, 0.5], row_heights: [0.5, 0.5], cells })

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
  test("its panes are its cells' panes in grid order, the Browser last when it shows pages", () => {
    expect(
      panesOf(ws([
        { panel: 'browser', col: 0, row: 0, favorite: 'a' },
        { panel: 'terminal', col: 1, row: 1 },
        { panel: 'files', col: 1, row: 0 },
        { panel: 'files', col: 0, row: 1 },
      ])),
    ).toEqual(['files', 'terminal', 'browser'])
    expect(panesOf(ws([]))).toEqual([])
  })

  test('closes the panes it does not use, opens the rest in order, and reports each', async () => {
    const f = fakeApp()
    f.open.add('Browser')
    f.open.add('Changes')
    const report = await applyWorkspace(f.app, ws([{ panel: 'terminal', col: 0, row: 0 }, { panel: 'changes', col: 0, row: 1 }, { panel: 'files', col: 1, row: 0 }]))
    expect(report).toBe('Terminal ✓ · Changes ✓ · Files ✓')
    expect(f.calls.filter(c => c.startsWith('menu'))).toEqual(['menu Hide Browser', 'menu Show Terminal', 'menu Show Files'])
  })

  test('a View menu it cannot read, or a pane it cannot click, is reported', async () => {
    const f = fakeApp()
    f.world.menuFails = true
    expect(await applyWorkspace(f.app, ws([{ panel: 'files', col: 0, row: 0 }]))).toBe('panes ✗ the View menu: not allowed assistive access')
    f.world.menuFails = false
    f.world.clickFails.add('Files')
    expect(await applyWorkspace(f.app, ws([{ panel: 'files', col: 0, row: 0 }, { panel: 'terminal', col: 1, row: 0 }]))).toBe('Show Files ✗ cannot click Files · Terminal ✓')
  })

  test("the workspace's model and effort are set for the session, after the switch; none named, none set", async () => {
    const f = fakeApp()
    expect(await applyWorkspace(f.app, ws([{ panel: 'files', col: 0, row: 0 }], null, 'sonnet', 'high'))).toBe('Files ✓ · model sonnet · effort high')
    expect(f.commands).toEqual(['/model sonnet', '/effort high'])
    await applyWorkspace(f.app, ws([]))
    expect(f.commands).toHaveLength(2)
  })

  test('the session moves to the folder, unless it is there; a refusal is said', async () => {
    const f = fakeApp()
    await applyWorkspace(f.app, ws([], '/proj'))
    await applyWorkspace(f.app, ws([], '/code'))
    await settle()
    expect(f.toasts).toEqual(['The session moves to /code'])
    f.world.folderAnswer = 'error'
    await applyWorkspace(f.app, ws([], '/code'))
    f.world.folderAnswer = 'throw'
    await applyWorkspace(f.app, ws([], '/code'))
    await settle()
    expect(f.toasts.slice(1)).toEqual(['Folder not moved: not allowed', 'Folder not moved: unreachable'])
  })
})

describe('single panes and tabs', () => {
  test('a page opens in a new tab of the Browser pane; a tab closes, quietly when gone', async () => {
    const f = fakeApp()
    await openPage(f.app, 'https://example.com')
    expect(f.open.has('Browser')).toBe(true)
    expect(await openTab(f.app, 'https://example.org')).toBe('t2')
    await closeTab(f.app, 't1')
    await closeTab(f.app, 'gone')
    expect(f.tabs).toEqual([{ tabId: 't2', url: 'https://example.org' }])
    f.world.browserRefuses = true
    await expect(openTab(f.app, 'https://example.com')).rejects.toThrow('refused')
    f.world.browserRefuses = false
    f.world.browserSilent = true
    await expect(openTab(f.app, 'https://example.com')).rejects.toThrow('preview_start failed')
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
