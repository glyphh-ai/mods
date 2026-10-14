// Favourites: pages kept once and shown in any workspace, each live page
// shared by every workspace that shows it. A favourite's id never changes,
// so renaming it or changing its address keeps the workspaces pointing at it.
import type { Entry, Favorite, FavoriteDraft } from '../../types'
import { freeId } from './files.ts'
import { urlOf } from './model.ts'

export const blankFavorite = (): FavoriteDraft => ({ id: null, name: '', url: '', error: null, isConfirmingDelete: false })

export const favoriteDraftOf = (f: Favorite): FavoriteDraft => ({ ...blankFavorite(), id: f.id, name: f.name, url: f.url })

/** The names of the workspaces showing a favourite. */
export const usedBy = (id: string, entries: Entry[]) => entries.filter(e => e.file.cells.some(c => c.favorite === id)).map(e => e.file.name)

/** The favourites with the draft saved in them, or the reason it cannot be. */
export function savedFavorites(d: FavoriteDraft, favorites: Favorite[]): { favorites: Favorite[] } | { error: string } {
  const name = d.name.trim()
  if (!name) return { error: 'Give the favourite a name.' }
  if (name.length > 60) return { error: 'Keep the name under 60 characters.' }
  if (favorites.some(f => f.id !== d.id && f.name.trim().toLowerCase() === name.toLowerCase())) {
    return { error: `A favourite named "${name}" already exists.` }
  }
  const url = urlOf(d.url)
  if (!url) return { error: `"${d.url.trim()}" is not a web address.` }
  if (d.id === null) return { favorites: [...favorites, { id: freeId(name, favorites), name, url }] }
  return { favorites: favorites.map(f => (f.id === d.id ? { ...f, name, url } : f)) }
}

/** The favourites without one, or why it stays: workspaces still show it. */
export function withoutFavorite(id: string, favorites: Favorite[], entries: Entry[]): { favorites: Favorite[] } | { error: string } {
  const users = usedBy(id, entries)
  const name = favorites.find(f => f.id === id)?.name ?? id
  if (users.length > 0) {
    return { error: `${users.join(', ')} ${users.length === 1 ? 'still shows' : 'still show'} ${name}: take it out of ${users.length === 1 ? 'that workspace' : 'those workspaces'} first.` }
  }
  return { favorites: favorites.filter(f => f.id !== id) }
}
