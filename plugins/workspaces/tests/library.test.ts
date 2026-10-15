import { describe, expect, test } from 'claude-code/testing'

import { checkFavorite, checkFavoriteDelete, checkWorkspace, checkWorkspaceDelete, pickedFolder, slugOf, urlOf, usedBy } from '../helper/library.mjs'
import type { LibWorkspace } from '../helper/library.mjs'

const FAVS = [
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client' },
]
const ws = (slug: string, name: string, favorite?: string): LibWorkspace => ({
  slug,
  file: { name, folder: null, cols: 1, rows: 1, col_widths: [1], row_heights: [1], cells: favorite ? [{ panel: 'browser', col: 0, row: 0, favorite }] : [{ panel: 'files', col: 0, row: 0 }] },
})
const LIB = { workspaces: [ws('comms', 'Comms', 'gmail'), ws('ide', 'IDE')], favorites: FAVS, choices: { models: ['default', 'sonnet', 'opus'], efforts: ['low', 'high'] } }
const input = (over: object = {}) => ({
  original: null,
  name: 'Mail',
  folder: '',
  cols: 2,
  rows: 1,
  cells: [{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }, { panel: 'terminal', col: 1, row: 0 }],
  ...over,
})

describe('what the editor may save: workspaces', () => {
  test('a new workspace: its file, at a free slug, sizes even unless given', () => {
    expect(checkWorkspace(input(), LIB)).toEqual({
      file: { name: 'Mail', folder: null, model: null, effort: null, cols: 2, rows: 1, col_widths: [0.5, 0.5], row_heights: [1], cells: input().cells },
      slug: 'mail',
      replaces: null,
    })
    const s = checkWorkspace(input({ name: 'Comms!', col_widths: [3, 1], folder: ' /code ' }), LIB)
    expect(s).toMatchObject({ slug: 'comms-2', file: { name: 'Comms!', col_widths: [0.75, 0.25], folder: '/code' } })
  })

  test('a rename moves the file; the same slug stays in place', () => {
    expect(checkWorkspace(input({ original: 'Comms', name: 'Mail' }), LIB)).toMatchObject({ slug: 'mail', replaces: 'comms' })
    expect(checkWorkspace(input({ original: 'Comms', name: 'comms' }), LIB)).toMatchObject({ slug: 'comms', replaces: null })
    expect(checkWorkspace(input({ original: 'Gone' }), LIB)).toEqual({ error: 'There is no workspace "Gone".' })
  })

  test("the app's checks: a name, a grid, at least one panel, cells inside it, none overlapping", () => {
    const err = (over: object) => (checkWorkspace(input(over), LIB) as { error?: string }).error
    expect(err({ name: ' ' })).toBe('Workspace name is required.')
    expect(err({ name: 'n'.repeat(61) })).toBe('Keep the name under 60 characters.')
    expect(err({ name: 'ide' })).toBe('A workspace named "ide" already exists.')
    expect(err({ folder: 'code' })).toBe('The folder must be an absolute path, or blank.')
    expect(err({ cols: 26 })).toBe('A grid is 1 to 25 columns and rows.')
    expect(err({ rows: 1.5 })).toBe('A grid is 1 to 25 columns and rows.')
    expect(err({ cells: [] })).toBe('Assign at least one panel to the grid.')
    expect(err({ cells: 'x' })).toBe('Assign at least one panel to the grid.')
    expect(err({ cells: [{ panel: 'claude', col: 0, row: 0 }] })).toBe('A cell shows something Workspaces does not know.')
    expect(err({ cells: [null] })).toBe('A cell shows something Workspaces does not know.')
    expect(err({ cells: [{ panel: 'files', col: 2, row: 0 }] })).toBe('A cell lies outside the grid.')
    expect(err({ cells: [{ panel: 'files', col: 1, row: 0, col_span: 2 }] })).toBe('A cell lies outside the grid.')
    expect(err({ cells: [{ panel: 'files', col: 0, row: 0, col_span: 2 }, { panel: 'changes', col: 1, row: 0 }] })).toBe('Two cells overlap.')
    expect(err({ cells: [{ panel: 'browser', col: 0, row: 0, favorite: 'gone' }] })).toBe('A cell shows a favourite that no longer exists: pick another.')
    expect(err({ cells: [{ panel: 'browser', col: 0, row: 0, favorite: 'gmail' }, { panel: 'browser', col: 1, row: 0, favorite: 'gmail' }] })).toBe(
      'Gmail is in this workspace twice: a page can be shown once.',
    )
    expect(err(null as unknown as object)).toBeUndefined()
    expect((checkWorkspace(null, LIB) as { error?: string }).error).toBe('Workspace name is required.')
  })

  test("model and effort: one this session offers, or none (the session's own stays)", () => {
    expect(checkWorkspace(input({ model: 'sonnet', effort: 'high' }), LIB)).toMatchObject({ file: { model: 'sonnet', effort: 'high' } })
    expect(checkWorkspace(input({ model: ' ', effort: '' }), LIB)).toMatchObject({ file: { model: null, effort: null } })
    expect(checkWorkspace(input({ model: 'gpt' }), LIB)).toEqual({ error: '"gpt" is not one of the models this session offers.' })
    expect(checkWorkspace(input({ effort: 'huge' }), LIB)).toEqual({ error: '"huge" is not an effort level.' })
    expect(checkWorkspace(input({ model: 'sonnet' }), { workspaces: [], favorites: FAVS })).toEqual({ error: '"sonnet" is not one of the models this session offers.' })
  })

  test("the Mac's folder chooser: the folder's path, or nothing when cancelled", () => {
    expect(pickedFolder({ code: 0, stdout: '/Users/me/code/\n' })).toBe('/Users/me/code')
    expect(pickedFolder({ code: 0, stdout: '/\n' })).toBe('/')
    expect(pickedFolder({ code: 1, stdout: '' })).toBeNull()
    expect(pickedFolder({ code: 0, stdout: 'execution error: User canceled. (-128)' })).toBeNull()
  })

  test('saved cells keep only what a file holds', () => {
    const r = checkWorkspace(input({ cells: [{ panel: 'files', col: 0, row: 0, col_span: 2, row_span: 1, favorite: 'x', junk: 1 }] }), LIB)
    expect('file' in r && r.file.cells).toEqual([{ panel: 'files', col: 0, row: 0, col_span: 2 }])
  })

  test('delete', () => {
    expect(checkWorkspaceDelete('IDE', LIB.workspaces)).toEqual({ slug: 'ide' })
    expect(checkWorkspaceDelete('Gone', LIB.workspaces)).toEqual({ error: 'There is no workspace "Gone".' })
  })
})

describe('what the editor may save: favourites', () => {
  test('add: a name and a web address, an id of its own; edit keeps the id', () => {
    expect(checkFavorite({ id: null, name: ' Notion ', url: 'notion.so' }, FAVS)).toEqual({ id: 'notion', favorites: [...FAVS, { id: 'notion', name: 'Notion', url: 'https://notion.so', keep_in_panel: false }] })
    expect(checkFavorite({ id: 'slack', name: 'Slack', url: 'https://app.slack.com/client', keep_in_panel: true }, FAVS)).toMatchObject({ favorites: [FAVS[0], { id: 'slack', keep_in_panel: true }] })
    expect(checkFavorite({ id: 'slack', name: 'Slack', url: 'https://app.slack.com/client', keep_in_panel: 'yes' }, FAVS)).toMatchObject({ favorites: [FAVS[0], { id: 'slack', keep_in_panel: false }] })
    expect(checkFavorite({ name: '***', url: 'x.com' }, [{ id: 'page', name: 'P', url: 'u' }])).toMatchObject({ id: 'page-2' })
    expect(checkFavorite({ id: 'gmail', name: 'Mail', url: 'https://mail.google.com/u/1' }, FAVS)).toEqual({
      id: 'gmail',
      favorites: [{ id: 'gmail', name: 'Mail', url: 'https://mail.google.com/u/1', keep_in_panel: false }, FAVS[1]],
    })
  })

  test('refused: no name, a taken name, not a web address, a favourite gone', () => {
    expect(checkFavorite({ name: '', url: 'x.com' }, FAVS)).toEqual({ error: 'Favourite name is required.' })
    expect(checkFavorite({ name: 'slack', url: 'x.com' }, FAVS)).toEqual({ error: 'A favourite named "slack" already exists.' })
    expect(checkFavorite({ name: 'X', url: 'ftp://x' }, FAVS)).toEqual({ error: '"ftp://x" is not a web address.' })
    expect(checkFavorite({ name: 'X' }, FAVS)).toEqual({ error: '"" is not a web address.' })
    expect(checkFavorite({ id: 'gone', name: 'X', url: 'x.com' }, FAVS)).toEqual({ error: 'That favourite no longer exists.' })
  })

  test('delete: refused while workspaces show it, naming them', () => {
    const two = [...LIB.workspaces, ws('mail', 'Mail', 'gmail')]
    expect(usedBy('gmail', two)).toEqual(['Comms', 'Mail'])
    expect(checkFavoriteDelete('gmail', FAVS, two)).toEqual({ error: 'Comms, Mail still show Gmail: take it out of those workspaces first.' })
    expect(checkFavoriteDelete('gmail', FAVS, LIB.workspaces)).toEqual({ error: 'Comms still shows Gmail: take it out of that workspace first.' })
    expect(checkFavoriteDelete('slack', FAVS, LIB.workspaces)).toEqual({ favorites: [FAVS[0]] })
    expect(checkFavoriteDelete('gone', FAVS, LIB.workspaces)).toEqual({ error: 'That favourite no longer exists.' })
  })

  test('names and addresses', () => {
    expect(slugOf('Mail & Cal')).toBe('mail-cal')
    expect(slugOf('***', 'page')).toBe('page')
    expect(urlOf('gmail.com')).toBe('https://gmail.com')
    expect(urlOf(undefined)).toBeNull()
    expect(urlOf('https://')).toBeNull()
    expect(urlOf('a b')).toBeNull()
  })
})
