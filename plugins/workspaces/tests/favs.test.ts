import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_FAVORITES } from '../hooks/workspaces/defaults.ts'
import { blankFavorite, favoriteDraftOf, savedFavorites, usedBy, withoutFavorite } from '../hooks/workspaces/favs.ts'
import type { Entry } from '../types'

const entry = (name: string, favorite?: string): Entry => ({
  slug: name.toLowerCase(),
  file: { name, folder: null, cols: 1, rows: 1, col_widths: [1], row_heights: [1], cells: favorite ? [{ panel: 'browser', col: 0, row: 0, favorite }] : [] },
})

describe('favourites', () => {
  test('add: a name, a web address, an id of its own', () => {
    const d = { ...blankFavorite(), name: ' Notion ', url: 'notion.so' }
    expect(savedFavorites(d, DEFAULT_FAVORITES)).toEqual({ favorites: [...DEFAULT_FAVORITES, { id: 'notion', name: 'Notion', url: 'https://notion.so' }] })
    expect(savedFavorites({ ...d, name: 'google' }, DEFAULT_FAVORITES)).toEqual({ error: 'A favourite named "google" already exists.' })
    expect(savedFavorites({ ...d, name: '' }, [])).toEqual({ error: 'Give the favourite a name.' })
    expect(savedFavorites({ ...d, name: 'n'.repeat(61) }, [])).toEqual({ error: 'Keep the name under 60 characters.' })
    expect(savedFavorites({ ...d, url: 'ftp://x' }, [])).toEqual({ error: '"ftp://x" is not a web address.' })
  })

  test('edit: renamed and readdressed, the id kept', () => {
    const d = { ...favoriteDraftOf(DEFAULT_FAVORITES[0]!), name: 'Gmail', url: 'https://mail.google.com/mail/u/1' }
    const saved = savedFavorites(d, DEFAULT_FAVORITES)
    expect('favorites' in saved && saved.favorites[0]).toEqual({ id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/mail/u/1' })
  })

  test('delete: refused while workspaces show it, naming them', () => {
    const entries = [entry('Comms', 'gmail'), entry('Mail', 'gmail'), entry('Files')]
    expect(usedBy('gmail', entries)).toEqual(['Comms', 'Mail'])
    expect(withoutFavorite('gmail', DEFAULT_FAVORITES, entries)).toEqual({ error: 'Comms, Mail still show Gmail: take it out of those workspaces first.' })
    expect(withoutFavorite('gmail', DEFAULT_FAVORITES, [entries[0]!])).toEqual({ error: 'Comms still shows Gmail: take it out of that workspace first.' })
    expect(withoutFavorite('google', DEFAULT_FAVORITES, entries)).toEqual({ favorites: DEFAULT_FAVORITES.filter(f => f.id !== 'google') })
    expect(withoutFavorite('gone', [], [entry('X', 'gone')])).toEqual({ error: 'X still shows gone: take it out of that workspace first.' })
  })
})
