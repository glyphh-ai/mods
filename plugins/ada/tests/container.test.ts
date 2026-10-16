import { describe, expect, test } from 'claude-code/testing'

import { inspectArgs, matches, parseInspect, pullArgs, removeArgs, runArgs, serverFor, startArgs, stopArgs } from '../hooks/ada/container.ts'

const DOCKER = { kind: 'docker' as const, cli: ['/usr/local/bin/docker'] }
const APPLE = { kind: 'container' as const, cli: ['/usr/local/bin/container'] }
const W = { image: 'ghcr.io/glyphh-ai/rrotor:0.1.0@sha256:abc', port: 47701, server: 'http://localhost:8080', tokenSha: 'f'.repeat(64) }

describe("the rrotor container's command lines", () => {
  test('Docker: read-only, /data on its volume, the local API on loopback only, the token as its hash, bwrap allowed', () => {
    const argv = runArgs(DOCKER, W)
    expect(argv.slice(0, 4)).toEqual(['/usr/local/bin/docker', 'run', '--detach', '--name'])
    expect(argv.join(' ')).toContain('--read-only --tmpfs /tmp:exec,mode=1777 --volume glyphh-rrotor-data:/data --publish 127.0.0.1:47701:7777')
    expect(argv.join(' ')).toContain('--security-opt seccomp=unconfined --security-opt systempaths=unconfined')
    expect(argv).toContain(`RROTOR_LOCAL_TOKEN_SHA256=${'f'.repeat(64)}`)
    expect(argv).toContain('RROTOR_SERVER=http://host.docker.internal:8080')
    expect(argv.at(-1)).toBe(W.image)
  })

  test("Apple's container: its own VM, so no security options; the server as given", () => {
    const argv = runArgs(APPLE, W).join(' ')
    expect(argv).not.toContain('security-opt')
    expect(argv).toContain('--publish 127.0.0.1:47701:7777')
    expect(argv).toContain('RROTOR_SERVER=http://localhost:8080')
  })

  test('the server as a container reaches it', () => {
    expect(serverFor(DOCKER, 'http://127.0.0.1:8080')).toBe('http://host.docker.internal:8080')
    expect(serverFor(DOCKER, 'https://api.glyphh.ai')).toBe('https://api.glyphh.ai')
    expect(serverFor(DOCKER, 'http://localhostish.com')).toBe('http://localhostish.com')
  })

  test('inspect, start, stop, remove, pull', () => {
    expect(inspectArgs(DOCKER)).toEqual(['/usr/local/bin/docker', 'inspect', 'glyphh-rrotor'])
    expect(removeArgs(DOCKER)).toEqual(['/usr/local/bin/docker', 'rm', '--force', 'glyphh-rrotor'])
    expect(removeArgs(APPLE)).toEqual(['/usr/local/bin/container', 'delete', '--force', 'glyphh-rrotor'])
    expect(startArgs(DOCKER)).toEqual(['/usr/local/bin/docker', 'start', 'glyphh-rrotor'])
    expect(stopArgs(DOCKER)).toEqual(['/usr/local/bin/docker', 'stop', 'glyphh-rrotor'])
    expect(pullArgs(DOCKER, 'x')).toEqual(['/usr/local/bin/docker', 'image', 'pull', 'x'])
  })

  test("what inspect says: Docker's shape and Apple's", () => {
    const docker = JSON.stringify([{ State: { Running: true }, Config: { Labels: { 'ai.glyphh.rrotor.local-token-sha256': 'h', 'ai.glyphh.rrotor.image': 'i' } } }])
    expect(parseInspect(docker)).toEqual({ running: true, tokenSha: 'h', image: 'i' })
    expect(parseInspect(JSON.stringify({ status: 'stopped', configuration: { labels: {} } }))).toEqual({ running: false, tokenSha: null, image: null })
    expect(parseInspect('not json')).toBeNull()
    expect(parseInspect('[]')).toBeNull()
    expect(matches({ running: false, tokenSha: W.tokenSha, image: W.image }, W)).toBe(true)
    expect(matches({ running: true, tokenSha: 'other', image: W.image }, W)).toBe(false)
  })
})
