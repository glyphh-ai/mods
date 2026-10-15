import { describe, expect, test } from 'claude-code/testing'

import { bundleOf, BundleError } from '../hooks/programs/bundle.ts'
import { fakeWorld, ok, SHA } from './fakes.ts'

function git(extra: Record<string, ReturnType<typeof ok>> = {}) {
  const f = fakeWorld()
  f.w.git.set('rev-parse --verify', ok(`${SHA}\n`))
  f.w.git.set(`show ${SHA}:glyphh.json`, ok('{"name":"daily_sales"}'))
  f.w.git.set(`merge-base --is-ancestor`, ok())
  f.w.git.set('bundle', ok('QUJD\nREVG\n'))
  for (const [k, v] of Object.entries(extra)) f.w.git.set(k, v)
  return f
}

describe('a folder at a commit, bundled for rrotor', () => {
  test("the commit's SHA, its program's name, and the bundle in base64 without line breaks", async () => {
    const f = git()
    expect(await bundleOf(f.run, '/Users/t/daily_sales')).toEqual({ commit: SHA, name: 'daily_sales', bundle: 'QUJDREVG' })
    expect(f.w.ran.at(-1)).toEqual(['/bin/sh', '-c', 'git -C "$1" bundle create - "$2" 2>/dev/null | /usr/bin/base64', 'sh', '/Users/t/daily_sales', 'HEAD'])
  })

  test('a commit not on HEAD bundles every branch', async () => {
    const f = git({ 'merge-base --is-ancestor': ok('', 1) })
    await bundleOf(f.run, '/p', 'feature')
    expect(f.w.ran.at(-1)!.at(-1)).toBe('--all')
  })

  test('refused: a relative folder, not a commit, no glyphh.json, not JSON, too big, git failing', async () => {
    await expect(bundleOf(git().run, 'daily_sales')).rejects.toThrow('absolute path')
    await expect(bundleOf(git({ 'rev-parse --verify': ok('', 128, 'fatal: bad revision\nmore') }).run, '/p')).rejects.toThrow('fatal: bad revision')
    await expect(bundleOf(git({ 'rev-parse --verify': ok('abc\n') }).run, '/p')).rejects.toThrow('is not a commit')
    await expect(bundleOf(git({ [`show ${SHA}:glyphh.json`]: ok('', 128, 'fatal: path') }).run, '/p')).rejects.toThrow('no glyphh.json')
    await expect(bundleOf(git({ [`show ${SHA}:glyphh.json`]: ok('{nope') }).run, '/p')).rejects.toThrow('not JSON')
    await expect(bundleOf(git({ bundle: { ...ok('QUJD'), isStdoutTruncated: true } }).run, '/p')).rejects.toThrow('too big')
    await expect(bundleOf(git({ bundle: ok('', 1) }).run, '/p')).rejects.toThrow(BundleError)
    const nothing = async () => null
    await expect(bundleOf(nothing, '/p')).rejects.toThrow('git did not run')
  })
})
