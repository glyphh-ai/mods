// A switch: the app's panes and folder, then the layout page: the layout
// switched inside the page when it is open, else the page opened once in the
// Browser pane. A plan without the live layout page (`stream` 0) switches
// the app's panes only. Works on a Switcher, closures over `$` that ./hooks.tsx hands it.
import type { Choices, Entry, Favorite, PageSettings } from '../../types'
import { applyWorkspace, closeTab, openTab, type App, type Value } from './desktop.ts'
import { layoutsFor, type EditorView, type Link } from './viewer.ts'

export type Switcher = {
  app: App
  entries: Value<Entry[]>
  favorites: Value<Favorite[]>
  choices: Value<Choices>
  /** The mod's settings, for the page. */
  settings: PageSettings
  active: Value<string | null>
  previous: Value<string | null>
  layoutTab: Value<string | null>
  /** What the layout page lacks on this Mac; null when it can run. */
  missing(): Promise<string | null>
  /** Why the plan leaves out the live layout page (its `stream` limit); null when it has it. */
  liveRefused(): Promise<string | null>
  /** The running helper, started when it is not. */
  link(): Promise<Link>
  /** The running helper, or null. */
  running(): Link | null
}

/** The layouts and the library they come from, sent to the helper, `name`
 *  on screen. Without the live layout page in the plan, the layouts go
 *  without their live pages (the editor still has them all). */
export async function push(s: Switcher, link: Link, name: string): Promise<void> {
  const workspaces = await s.entries.get()
  const favorites = await s.favorites.get()
  const live = (await s.liveRefused()) === null
  const layouts = layoutsFor(workspaces, favorites).map(l => (live ? l : { ...l, cells: l.cells.filter(c => c.panel !== 'browser') }))
  await link.setLayouts(layouts, name, { workspaces, favorites, choices: await s.choices.get() }, s.settings)
}

const short = (err: unknown) => String(err).replace(/^(Hooks)?Error: /, '').slice(0, 160)

/** The layout page on `name`, or on its workspace editor when `view` says:
 *  switched inside the open page, or the page opened. Says how it went. */
export async function showLayout(s: Switcher, name: string, view?: EditorView): Promise<string> {
  const missing = await s.missing()
  if (missing) return missing
  try {
    const link = await s.link()
    await push(s, link, name)
    if (await link.isOpen()) {
      if (view) await link.show(view)
      return 'layout page ✓'
    }
    const url = await link.pageUrl(view)
    const known = await s.layoutTab.get()
    if (known) await closeTab(s.app, known)
    try {
      const tab = await openTab(s.app, url)
      await s.layoutTab.set(() => tab ?? null)
      return 'layout page ✓'
    } catch {
      s.app.ask(`Open this page in the browser pane (it opens once): ${url}`)
      return 'layout page: Claude is asked to open it'
    }
  } catch (err) {
    return `layout page ✗ ${short(err)}`
  }
}

/** Everything `/dip` and the list's Open do. */
export async function switchTo(s: Switcher, target: Entry): Promise<string> {
  const name = target.file.name
  const from = await s.active.get()
  if (from !== name) {
    await s.previous.set(() => from)
    await s.active.set(() => name)
  }
  const panes = await applyWorkspace(s.app, target.file)
  let page = ''
  const hasLive = target.file.cells.some(c => c.panel === 'browser')
  const refused = hasLive ? await s.liveRefused() : null
  if (hasLive && !refused) page = await showLayout(s, name)
  else {
    if (refused) page = refused
    const link = s.running()
    if (link) await push(s, link, name).catch(() => undefined)
  }
  const said = [panes, page].filter(Boolean).join(' · ')
  return `→ ${name}${said ? `  ${said}` : ''}`
}
