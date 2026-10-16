import { describe, expect, test } from 'claude-code/testing'

import { detect, missing } from '../hooks/ada/runtime.ts'
import { fakeWorld } from './fakes.ts'

describe('which container runtime runs rrotor', () => {
  test("Apple's container first, on macOS 26 and Apple silicon", async () => {
    const { sys } = fakeWorld({ kinds: ['container', 'docker'], macos: '26.0' })
    expect(await detect(sys, 'auto')).toEqual({ kind: 'container', cli: ['/usr/local/bin/container'] })
  })

  test("not on an older Mac or an Intel one: then OrbStack, then Docker", async () => {
    expect(await detect(fakeWorld({ kinds: ['container', 'orbstack'], macos: '15.4' }).sys, 'auto')).toEqual({ kind: 'orbstack', cli: ['/usr/local/bin/docker', '--context', 'orbstack'] })
    expect(await detect(fakeWorld({ kinds: ['container', 'docker'], macos: '26.1', arch: 'x86_64' }).sys, 'auto')).toEqual({ kind: 'docker', cli: ['/usr/local/bin/docker'] })
  })

  test('the one chosen in /config, or why not', async () => {
    expect(await detect(fakeWorld({ kinds: ['orbstack', 'docker'] }).sys, 'docker')).toEqual({ kind: 'docker', cli: ['/usr/local/bin/docker'] })
    expect(await detect(fakeWorld({ kinds: ['docker'] }).sys, 'orbstack')).toEqual({ missing: expect.stringContaining('OrbStack, which is not running') })
  })

  test("none: Apple's container offered on a Mac that fits it, OrbStack otherwise", async () => {
    expect(await missing(fakeWorld({ kinds: [], macos: '26.0' }).sys, 'auto')).toContain("Install Apple's container")
    expect(await detect(fakeWorld({ kinds: [] }).sys, 'auto')).toEqual({ missing: expect.stringContaining('install OrbStack') })
  })
})
