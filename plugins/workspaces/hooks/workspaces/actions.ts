// What the workspaces pane does: each action changes the files, reads them
// back into the session, and leaves a note saying how it went.
import type { Entry, Note, Pane, WorkspaceFile } from '../../types'
import type { Value } from './desktop.ts'
import { addWorkspace, deleteWorkspace, patchWorkspace, readAll, renameWorkspace, type Disk } from './files.ts'
import { blankFile, tabFor, urlOf } from './model.ts'

export type Ctx = {
  disk: Disk
  entries: Value<Entry[]>
  active: Value<string | null>
  previous: Value<string | null>
  selected: Value<string | null>
  note: Value<Note | null>
}

export type Field = 'model' | 'folder' | 'permission_mode' | 'effort'

const say = (ctx: Ctx, text: string, isError = false) => ctx.note.set((): Note => ({ text, isError }))

/** Runs one change; its note is `done`, or the reason it failed. */
async function act(ctx: Ctx, done: string, change: () => Promise<void>): Promise<void> {
  try {
    await change()
    const all = await readAll(ctx.disk)
    await ctx.entries.set(() => all)
    await say(ctx, done)
  } catch (err) {
    await say(ctx, String(err).replace(/^Error: /, ''), true)
  }
}

const follow = (from: string, to: string | null) => (v: string | null) => (v === from ? to : v)

export function create(ctx: Ctx, raw: string): Promise<void> {
  const name = raw.trim()
  if (!name) return say(ctx, 'Give the workspace a name.', true)
  return act(ctx, `Workspace "${name}" created.`, async () => {
    await addWorkspace(ctx.disk, blankFile(name))
    await ctx.selected.set(() => name)
  })
}

export function rename(ctx: Ctx, from: string, raw: string): Promise<void> {
  const to = raw.trim()
  if (!to || to === from) return Promise.resolve()
  return act(ctx, `Renamed to "${to}".`, async () => {
    await renameWorkspace(ctx.disk, from, to)
    for (const v of [ctx.selected, ctx.active, ctx.previous]) await v.set(follow(from, to))
  })
}

export const remove = (ctx: Ctx, name: string) =>
  act(ctx, `Workspace "${name}" deleted.`, async () => {
    await deleteWorkspace(ctx.disk, name)
    for (const v of [ctx.selected, ctx.active, ctx.previous]) await v.set(follow(name, null))
  })

const patch = (ctx: Ctx, name: string, done: string, fn: (f: WorkspaceFile) => WorkspaceFile) =>
  act(ctx, done, () => patchWorkspace(ctx.disk, name, fn))

/** A session setting; blank clears it. A folder must be absolute. */
export function setField(ctx: Ctx, name: string, field: Field, raw: string): Promise<void> {
  const value = raw.trim() || null
  if (field === 'folder' && value && !value.startsWith('/')) return say(ctx, 'The folder must be an absolute path.', true)
  return patch(ctx, name, `${name}: ${field.replace('_', ' ')} saved.`, f => ({ ...f, [field]: value }))
}

/** A pane in or out of the workspace; one put in opens last. */
export const togglePane = (ctx: Ctx, name: string, pane: Pane) =>
  patch(ctx, name, `${name}: panes saved.`, f => ({
    ...f,
    desktop_panes: f.desktop_panes.includes(pane) ? f.desktop_panes.filter(p => p !== pane) : [...f.desktop_panes, pane],
  }))

export const toggleSidebar = (ctx: Ctx, name: string) =>
  patch(ctx, name, `${name}: sidebar saved.`, f => ({ ...f, collapse_sidebar: !f.collapse_sidebar }))

export function addTab(ctx: Ctx, name: string, raw: string): Promise<void> {
  const url = urlOf(raw)
  if (!url) return say(ctx, `"${raw.trim()}" is not a web address.`, true)
  return patch(ctx, name, `${name}: ${url} added.`, f => ({ ...f, tabs: [...f.tabs, tabFor(url)] }))
}

export const removeTab = (ctx: Ctx, name: string, index: number) =>
  patch(ctx, name, `${name}: tab removed.`, f => ({ ...f, tabs: f.tabs.filter((_, i) => i !== index) }))
