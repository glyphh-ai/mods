// The Claude desktop app's own panes, driven for a workspace. The app's MCP
// servers do part of it: Claude_Browser (tabs), ccd_view (a file in the Files
// pane), ccd_window (the sidebar), ccd_directory (the session's folder). The
// rest only the app's View menu does ("Show Files" opens the Files pane as a
// browser, "Show Browser" the Browser pane; each reads "Hide …" while open),
// clicked through System Events, which needs the app's Accessibility
// permission. Works on an App, closures over `$` that ./hooks.tsx hands it.
import type { McpToolResult, ProcessRunInit, ProcessRunResult } from 'claude-code'

import type { Pane, WorkspaceFile } from '../../types'

/** One state value: read it, or change it from what it is. */
export type Value<T> = { get(): Promise<T>; set(fn: (v: T) => T): Promise<void> }

export type App = {
  mcp(server: string, tool: string, args: Record<string, unknown>): Promise<McpToolResult>
  run(argv: readonly string[], init?: ProcessRunInit): Promise<ProcessRunResult>
  cwd(): Promise<string>
  isFile(path: string): Promise<boolean>
  toast(text: string): void
  /** Asks Claude, as a prompt of its own once this command is done: the way
   *  round a refused tool call. */
  ask(text: string): void
  paneTabs: Value<Record<string, string>>
  openFile: Value<string | null>
}

export const MENU_PANES = { files: 'Files', changes: 'Changes', terminal: 'Terminal', browser: 'Browser' } as const
export type MenuPane = keyof typeof MENU_PANES

const textOf = (r: McpToolResult) => r.content.map(b => b.text ?? '').join('\n')
const short = (err: unknown, n: number) => String(err).replace(/^(Hooks)?Error: /, '').slice(0, n)

async function call(app: App, server: string, tool: string, args: Record<string, unknown>): Promise<string> {
  const r = await app.mcp(server, tool, args)
  const text = textOf(r)
  if (r.isError) throw new Error(text || `${tool} failed`)
  return text
}

async function viewMenu(app: App, script: string): Promise<string> {
  const r = await app.run([
    'osascript',
    '-e',
    `tell application "System Events" to tell process "Claude" to ${script} of menu 1 of menu bar item "View" of menu bar 1`,
  ])
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || 'osascript failed')
  return r.stdout.trim()
}

const menuItems = async (app: App) => (await viewMenu(app, 'get name of every menu item')).split(', ')
const click = (app: App, label: string) => viewMenu(app, `click menu item "${label}"`)

/** One View-menu pane shown or hidden; says what it did. */
export async function togglePane(app: App, pane: MenuPane, on: boolean): Promise<string> {
  const label = MENU_PANES[pane]
  const isOpen = (await menuItems(app)).includes(`Hide ${label}`)
  if (isOpen === on) return `${label} already ${on ? 'open' : 'closed'}`
  await click(app, `${on ? 'Show' : 'Hide'} ${label}`)
  return `${label} ${on ? 'open' : 'closed'}`
}

export const showFile = (app: App, path: string) => call(app, 'ccd_view', 'show_pane', { pane: 'file', path })

/** A page in the Browser pane, in a new tab. */
export async function openPage(app: App, url: string): Promise<void> {
  await togglePane(app, 'browser', true)
  await call(app, 'Claude_Browser', 'preview_start', { url })
}

/** A file by path (absolute or from the session's folder), or by name under it. */
export async function findFile(app: App, name: string): Promise<string[]> {
  const cwd = await app.cwd()
  const direct = name.startsWith('/') ? name : `${cwd}/${name}`
  if (await app.isFile(direct)) return [direct]
  const base = name.split('/').pop()!
  const r = await app
    .run(['find', cwd, '-type', 'f', '-name', base, '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'], { timeoutMs: 10_000 })
    .catch(() => null)
  const hits = (r?.stdout ?? '').split('\n').filter(Boolean)
  return name.includes('/') ? hits.filter(h => h.endsWith(`/${name}`)) : hits
}

/** The app's panes for a workspace: close what it does not list, then open
 *  what it does, in order. Says, per pane, how it went. */
async function applyPanes(app: App, ws: WorkspaceFile): Promise<string[]> {
  const want: Pane[] = [...ws.desktop_panes]
  if (ws.tabs.length > 0 && !want.includes('browser')) want.push('browser')
  const report: string[] = []
  let items: string[]
  try {
    items = await menuItems(app)
  } catch (err) {
    return [`panes ✗ the View menu: ${short(err, 120)}`]
  }
  const press = async (label: string) => {
    try {
      await click(app, label)
      return true
    } catch (err) {
      report.push(`${label} ✗ ${short(err, 80)}`)
      return false
    }
  }
  for (const [pane, label] of Object.entries(MENU_PANES)) {
    if (!want.includes(pane as Pane) && items.includes(`Hide ${label}`)) await press(`Hide ${label}`)
  }
  for (const pane of want) {
    if (pane === 'editor') {
      const file = await app.openFile.get()
      if (!file) continue
      report.push(await showFile(app, file).then(() => 'Editor ✓', err => `Editor ✗ ${short(err, 80)}`))
      continue
    }
    const label = MENU_PANES[pane]
    if (items.includes(`Hide ${label}`) || (await press(`Show ${label}`))) report.push(`${label} ✓`)
  }
  return report
}

/** One tab's page in front: its own tab where the pane still has it, else
 *  an open tab on the same site no other tab claims, else a new tab. */
async function showTab(app: App, key: string, url: string): Promise<void> {
  const known = (await app.paneTabs.get())[key]
  const remember = (tab: string | undefined) =>
    app.paneTabs.set(all => {
      const next = { ...all }
      if (tab) next[key] = tab
      else delete next[key]
      return next
    })
  if (known) {
    const selected = await call(app, 'Claude_Browser', 'tabs_select', { tabId: known }).then(() => true, () => false)
    if (selected) return
    await remember(undefined)
  }
  try {
    const raw = await call(app, 'Claude_Browser', 'tabs_context', {})
    const ctx = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { tabs?: { tabId: string; origin: string }[] }
    const claimed = new Set(Object.values(await app.paneTabs.get()))
    const host = new URL(url).host
    const same = ctx.tabs?.find(t => !claimed.has(t.tabId) && new URL(t.origin).host === host)
    if (same) {
      await call(app, 'Claude_Browser', 'tabs_select', { tabId: same.tabId })
      await remember(same.tabId)
      return
    }
  } catch {
    // No listing (or it was refused): a new tab.
  }
  const text = await call(app, 'Claude_Browser', 'preview_start', { url })
  await remember(/"tabId":\s*"([^"]+)"/.exec(text)?.[1])
}

/** The workspace's tabs, its first in front. Where the app refuses the mod's
 *  own call (auto mode checks opening a page), Claude is asked to open them. */
async function applyTabs(app: App, ws: WorkspaceFile): Promise<void> {
  if (ws.tabs.length === 0) return
  try {
    for (let i = ws.tabs.length - 1; i >= 0; i--) await showTab(app, `${ws.name}#${i}`, ws.tabs[i]!.url)
  } catch {
    const urls = ws.tabs.map(t => t.url).join(', ')
    app.ask(`Open these in the browser pane as tabs, the first one in front (workspace "${ws.name}"): ${urls}`)
  }
}

async function moveFolder(app: App, folder: string | null): Promise<void> {
  if (!folder || folder === (await app.cwd())) return
  try {
    const r = await app.mcp('ccd_directory', 'change_directory', { path: folder })
    app.toast(r.isError ? `Folder not moved: ${textOf(r).slice(0, 120)}` : `The session moves to ${folder}`)
  } catch (err) {
    app.toast(`Folder not moved: ${short(err, 120)}`)
  }
}

/** Everything a switch does: the sidebar, the panes, the tabs, then the
 *  folder, which may wait on the person's approval, so nothing waits on it. */
export async function applyWorkspace(app: App, ws: WorkspaceFile): Promise<string> {
  await app.mcp('ccd_window', 'set_sidebar_collapsed', { collapsed: ws.collapse_sidebar }).catch(() => undefined)
  const report = await applyPanes(app, ws)
  await applyTabs(app, ws)
  void moveFolder(app, ws.folder)
  return report.join(' · ')
}
