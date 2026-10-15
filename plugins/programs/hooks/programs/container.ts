// The rrotor container's command lines, for Docker and OrbStack (the docker
// command) and Apple's container. Pure. rrotor's docs/architecture.md,
// sections 1.2, 4 and 11: /data on a named volume, the local API on the
// host's loopback only, the local token's SHA-256 (never the token), and the
// security options bubblewrap needs inside a Docker container.
import type { Runtime } from './runtime.ts'

export const NAME = 'glyphh-rrotor'
export const VOLUME = 'glyphh-rrotor-data'
export const INSIDE = 7777
export const LABEL_TOKEN = 'ai.glyphh.rrotor.local-token-sha256'
export const LABEL_IMAGE = 'ai.glyphh.rrotor.image'

export type Wanted = { image: string; port: number; server: string; tokenSha: string }

/** The Glyphh server as the container reaches it: this Mac's localhost is the host's, not the container's. */
export function serverFor(rt: Runtime, server: string): string {
  if (rt.kind === 'container') return server
  return server.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, '$1host.docker.internal')
}

export function runArgs(rt: Runtime, w: Wanted): string[] {
  const env = ['RROTOR_MODE=local', `RROTOR_SERVER=${serverFor(rt, w.server)}`, `RROTOR_HOST_PORT=${w.port}`, `RROTOR_LOCAL_TOKEN_SHA256=${w.tokenSha}`]
  const labels = [`${LABEL_TOKEN}=${w.tokenSha}`, `${LABEL_IMAGE}=${w.image}`]
  if (rt.kind === 'container') {
    return [...rt.cli, 'run', '--detach', '--name', NAME, '--volume', `${VOLUME}:/data`, '--publish', `127.0.0.1:${w.port}:${INSIDE}`,
      ...env.flatMap(e => ['--env', e]), ...labels.flatMap(l => ['--label', l]), w.image]
  }
  return [...rt.cli, 'run', '--detach', '--name', NAME, '--restart', 'unless-stopped', '--read-only', '--tmpfs', '/tmp:exec,mode=1777',
    '--volume', `${VOLUME}:/data`, '--publish', `127.0.0.1:${w.port}:${INSIDE}`,
    '--security-opt', 'seccomp=unconfined', '--security-opt', 'systempaths=unconfined',
    ...env.flatMap(e => ['--env', e]), ...labels.flatMap(l => ['--label', l]), w.image]
}

export const inspectArgs = (rt: Runtime) => [...rt.cli, 'inspect', NAME]
export const removeArgs = (rt: Runtime) => [...rt.cli, rt.kind === 'container' ? 'delete' : 'rm', '--force', NAME]
export const stopArgs = (rt: Runtime) => [...rt.cli, 'stop', NAME]
export const startArgs = (rt: Runtime) => [...rt.cli, 'start', NAME]
export const pullArgs = (rt: Runtime, image: string) => [...rt.cli, 'image', 'pull', image]

export type Found = { running: boolean; tokenSha: string | null; image: string | null }

/** What `inspect` says of the container: running, and which token and image it was made with. */
export function parseInspect(text: string): Found | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const first = (Array.isArray(data) ? data[0] : data) as Record<string, any> | undefined
  if (!first || typeof first !== 'object') return null
  // Docker: State.Running, Config.Labels; Apple's container: status, configuration.labels.
  const running = first.State?.Running === true || first.status === 'running'
  const labels = (first.Config?.Labels ?? first.configuration?.labels ?? {}) as Record<string, string>
  return { running, tokenSha: labels[LABEL_TOKEN] ?? null, image: labels[LABEL_IMAGE] ?? null }
}

/** The container as it should be: same token, same image. */
export const matches = (found: Found, w: Wanted) => found.tokenSha === w.tokenSha && found.image === w.image
