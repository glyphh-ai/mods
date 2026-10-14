import { describe, expect, test } from 'claude-code/testing'

import { blankFile, normalise, slugOf, tabFor, urlOf } from '../hooks/workspaces/model.ts'

describe('workspace model', () => {
  test('slugs', () => {
    expect(slugOf('Comms & Mail!')).toBe('comms-mail')
    expect(slugOf('***')).toBe('workspace')
  })

  test('web addresses as typed', () => {
    expect(urlOf(' gmail.com ')).toBe('https://gmail.com')
    expect(urlOf('http://localhost:3000/x')).toBe('http://localhost:3000/x')
    expect(urlOf('')).toBeNull()
    expect(urlOf('two words')).toBeNull()
    expect(urlOf('file:///etc/hosts')).toBeNull()
    expect(urlOf('https://')).toBeNull()
  })

  test('a tab is named after its site', () => {
    expect(tabFor('https://www.example.com/a')).toEqual({ url: 'https://www.example.com/a', name: 'example.com' })
  })

  test('a file from an earlier version keeps what this one uses and drops the rest', () => {
    const old = {
      name: 'Comms',
      model: 'opus',
      folder: '/Users/me/yo',
      permission_mode: 'plan',
      effort: '',
      cols: 2,
      rows: 2,
      col_widths: [0.5, 0.5],
      cells: [{ panel: 'browser', col: 0, row: 0, tab: 0 }],
      desktop_panes: ['terminal', 'nope', 'files', 'terminal'],
      collapse_sidebar: true,
      tabs: [{ url: 'https://mail.google.com', name: 'mail.google.com', no_redirect: false, rpa: { commands: [] } }, { url: 'https://x.com' }, { name: 'no url' }, null],
    }
    expect(normalise(old)).toEqual({
      name: 'Comms',
      folder: '/Users/me/yo',
      model: 'opus',
      permission_mode: 'plan',
      effort: null,
      desktop_panes: ['terminal', 'files'],
      collapse_sidebar: true,
      tabs: [
        { url: 'https://mail.google.com', name: 'mail.google.com' },
        { url: 'https://x.com', name: 'https://x.com' },
      ],
    })
  })

  test('something that is not a workspace is not read as one', () => {
    expect(normalise(null)).toBeNull()
    expect(normalise('Comms')).toBeNull()
    expect(normalise({ name: ' ' })).toBeNull()
    expect(normalise({ name: 'Bare' })).toEqual(blankFile('Bare'))
  })
})
