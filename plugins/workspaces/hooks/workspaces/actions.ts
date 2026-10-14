// What the workspaces pane does: move between its pages, change a draft, and
// save or delete, each change written to ~/.glyphh and read back.
import type { Draft, Entry, Favorite, FavoriteDraft, Note, View } from '../../types'
import type { Value } from './desktop.ts'
import { blankDraft, draftOf, fileOf } from './draft.ts'
import { blankFavorite, favoriteDraftOf, savedFavorites, withoutFavorite } from './favs.ts'
import { addWorkspace, deleteWorkspace, load, replaceWorkspace, writeFavorites, type Disk } from './files.ts'

export type Ctx = {
  disk: Disk
  entries: Value<Entry[]>
  favorites: Value<Favorite[]>
  active: Value<string | null>
  previous: Value<string | null>
  view: Value<View>
  note: Value<Note | null>
}

const errorText = (err: unknown) => String(err).replace(/^Error: /, '')

/** Reads ~/.glyphh again into the session. */
export async function reload(ctx: Ctx): Promise<void> {
  const { entries, favorites } = await load(ctx.disk)
  await ctx.entries.set(() => entries)
  await ctx.favorites.set(() => favorites)
}

const go = (ctx: Ctx, view: View) => ctx.view.set(() => view)

export const showList = (ctx: Ctx) => go(ctx, { page: 'list' })
export const newWorkspace = (ctx: Ctx) => go(ctx, { page: 'edit', draft: blankDraft() })

export async function editWorkspace(ctx: Ctx, name: string): Promise<void> {
  const entry = (await ctx.entries.get()).find(e => e.file.name === name)
  if (entry) await go(ctx, { page: 'edit', draft: draftOf(entry.file) })
}

/** The open draft changed by `fn`; nothing when the form is not open. */
export const changeDraft = (ctx: Ctx, fn: (d: Draft) => Draft) =>
  ctx.view.set(v => (v.page === 'edit' ? { page: 'edit', draft: fn(v.draft) } : v))

const failDraft = (ctx: Ctx, error: string) => changeDraft(ctx, d => ({ ...d, error, isConfirmingDelete: false }))

const follow = (from: string, to: string | null) => (v: string | null) => (v === from ? to : v)

export async function saveDraft(ctx: Ctx): Promise<void> {
  const view = await ctx.view.get()
  if (view.page !== 'edit') return
  const d = view.draft
  const made = fileOf(d, await ctx.entries.get(), await ctx.favorites.get())
  if ('error' in made) return failDraft(ctx, made.error)
  try {
    if (d.original === null) await addWorkspace(ctx.disk, made.file)
    else await replaceWorkspace(ctx.disk, d.original, made.file)
    if (d.original !== null && d.original !== made.file.name) {
      for (const v of [ctx.active, ctx.previous]) await v.set(follow(d.original, made.file.name))
    }
    await reload(ctx)
    await ctx.note.set(() => ({ text: `Workspace "${made.file.name}" saved.`, isError: false }))
    await showList(ctx)
  } catch (err) {
    await failDraft(ctx, errorText(err))
  }
}

export async function deleteDraft(ctx: Ctx): Promise<void> {
  const view = await ctx.view.get()
  if (view.page !== 'edit' || view.draft.original === null) return
  const name = view.draft.original
  try {
    await deleteWorkspace(ctx.disk, name)
    for (const v of [ctx.active, ctx.previous]) await v.set(follow(name, null))
    await reload(ctx)
    await ctx.note.set(() => ({ text: `Workspace "${name}" deleted.`, isError: false }))
    await showList(ctx)
  } catch (err) {
    await failDraft(ctx, errorText(err))
  }
}

export const showFavorites = (ctx: Ctx) => go(ctx, { page: 'favorites' })
export const newFavorite = (ctx: Ctx) => go(ctx, { page: 'favorite', draft: blankFavorite() })

export async function editFavorite(ctx: Ctx, id: string): Promise<void> {
  const f = (await ctx.favorites.get()).find(x => x.id === id)
  if (f) await go(ctx, { page: 'favorite', draft: favoriteDraftOf(f) })
}

export const changeFavorite = (ctx: Ctx, fn: (d: FavoriteDraft) => FavoriteDraft) =>
  ctx.view.set(v => (v.page === 'favorite' ? { page: 'favorite', draft: fn(v.draft) } : v))

const failFavorite = (ctx: Ctx, error: string) => changeFavorite(ctx, d => ({ ...d, error, isConfirmingDelete: false }))

async function writeAndList(ctx: Ctx, favorites: Favorite[], said: string): Promise<void> {
  await writeFavorites(ctx.disk, favorites)
  await reload(ctx)
  await ctx.note.set(() => ({ text: said, isError: false }))
  await showFavorites(ctx)
}

export async function saveFavorite(ctx: Ctx): Promise<void> {
  const view = await ctx.view.get()
  if (view.page !== 'favorite') return
  const made = savedFavorites(view.draft, await ctx.favorites.get())
  if ('error' in made) return failFavorite(ctx, made.error)
  await writeAndList(ctx, made.favorites, `Favourite "${view.draft.name.trim()}" saved.`).catch(err => failFavorite(ctx, errorText(err)))
}

export async function deleteFavorite(ctx: Ctx): Promise<void> {
  const view = await ctx.view.get()
  if (view.page !== 'favorite' || view.draft.id === null) return
  const made = withoutFavorite(view.draft.id, await ctx.favorites.get(), await ctx.entries.get())
  if ('error' in made) return failFavorite(ctx, made.error)
  await writeAndList(ctx, made.favorites, `Favourite "${view.draft.name}" deleted.`).catch(err => failFavorite(ctx, errorText(err)))
}
