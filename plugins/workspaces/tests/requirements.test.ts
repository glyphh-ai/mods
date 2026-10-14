import { describe, expect, test } from 'claude-code/testing'

import { findChrome, findNode, missingText, type Probe } from '../hooks/workspaces/requirements.ts'

function probe(paths: string[], nodes: Record<string, string>, shell = '') {
  const p: Probe = {
    exists: async path => paths.includes(path),
    run: async argv => {
      if (argv[0] === '/bin/zsh') return shell ? { exitCode: 0, stdout: shell } : { exitCode: 1, stdout: '' }
      const v = nodes[argv[0]!]
      return v === undefined ? null : { exitCode: 0, stdout: v }
    },
  }
  return p
}

const APP = 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

describe('requirements', () => {
  test("Chrome in /Applications, else in the person's own", async () => {
    expect(await findChrome(probe([`/${APP}`], {}), '/Users/me')).toBe(`/${APP}`)
    expect(await findChrome(probe([`/Users/me/${APP}`], {}), '/Users/me/')).toBe(`/Users/me/${APP}`)
    expect(await findChrome(probe([], {}), undefined)).toBeNull()
  })

  test('Node 18 or newer: on the PATH, from the login shell, or where Homebrew puts it', async () => {
    expect(await findNode(probe([], { node: 'v22.1.0\n' }))).toBe('node')
    expect(await findNode(probe([], { node: 'v16.0.0', '/Users/me/.nvm/node': 'v20.0.0' }, 'loading…\n/Users/me/.nvm/node\n'))).toBe('/Users/me/.nvm/node')
    expect(await findNode(probe([], { '/usr/local/bin/node': 'v18.2.0' }))).toBe('/usr/local/bin/node')
    expect(await findNode(probe([], { '/opt/homebrew/bin/node': 'garbage' }))).toBeNull()
  })

  test('what to install, said exactly', () => {
    expect(missingText(null)).toBeNull()
    expect(missingText({ chrome: '/c', node: 'node' })).toBeNull()
    expect(missingText({ chrome: null, node: 'node' })).toBe('The layout page needs Google Chrome (https://www.google.com/chrome/). Install it, then start a new session.')
    expect(missingText({ chrome: null, node: null })).toBe(
      'The layout page needs Google Chrome (https://www.google.com/chrome/) and Node.js 18 or newer (https://nodejs.org). Install them, then start a new session.',
    )
  })
})
