// The world beneath core.ts, in memory: the Mac's commands (git, the container
// runtimes), rrotor's local API, the Glyphh server, the store and the clock.
import type { AccountState, LicencePayload } from '../types'
import { INITIAL } from '../hooks/licence/access.ts'
import type { Deps, Settings } from '../hooks/programs/core.ts'
import type { RunResult } from '../hooks/programs/runtime.ts'

export const NOW = Date.parse('2026-10-15T09:00:00Z')
export const SERVER = 'http://localhost:8080'
export const SHA = 'a'.repeat(40)

export const ok = (stdout = '', exitCode = 0, stderr = ''): RunResult => ({ exitCode, stdout, stderr })

export function account(limits: Record<string, number | null> | null, plan = 'Pro'): AccountState {
  const licence: LicencePayload = {
    install_id: 'i-1',
    user_id: 'u',
    org_id: 'o',
    plan,
    mods: limits ? { programs: { limits }, ada: { limits: {} } } : { ada: { limits: {} } },
    expires_at: '2027-01-01T00:00:00Z',
  }
  return { ...INITIAL, install: { install_id: 'i-1', token: 'install-token' }, licence, fetchedAt: NOW, plans: [] }
}

export type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

/** rrotor as its local API answers, and the Glyphh server's runtime token. */
export function fakeRrotor() {
  const r = {
    up: true,
    upAfter: 0,
    link: 'online',
    programs: [] as { name: string }[],
    calls: [] as Call[],
    issued: 0,
    answers: new Map<string, { status: number; body: unknown }>(),
    serverStatus: 200,
  }
  const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, text: typeof body === 'string' ? body : JSON.stringify(body) })
  const fetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const u = new URL(url)
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined }
    r.calls.push(call)
    if (url.startsWith(SERVER)) {
      if (u.pathname === '/v1/runtime/local' && call.headers.Authorization === 'Bearer install-token') {
        r.issued++
        return res(r.serverStatus, { runtime_id: '5f1c0a52-8d3e-4b7a-9c21-5e4f3a2b1c0d', token: 'runtime-token-' + r.issued })
      }
      return res(401, { error: { code: 'E_AUTH', message: 'no' } })
    }
    if (u.pathname === '/healthz') {
      if (r.upAfter > 0) {
        r.upAfter--
        throw new Error('connection refused')
      }
      if (!r.up) throw new Error('connection refused')
      return res(200, { ok: true })
    }
    if (!r.up) throw new Error('connection refused')
    const key = `${call.method} ${u.pathname}`
    const canned = r.answers.get(key)
    if (canned) return res(canned.status, canned.body)
    if (key === 'GET /v1/health')
      return res(200, { version: '0.1.0', mode: 'local', runtime_id: null, link: { state: r.link, since: 0, last_close: null, owed: 0 }, sandbox: { ready: true, layers: { landlock: { ok: true, detail: 'ABI 6' } } }, approvals: 0, programs: r.programs.length })
    if (key === 'PUT /v1/runtime/token') {
      r.link = 'online'
      return res(200, { link: 'connecting' })
    }
    if (key === 'GET /v1/programs') return res(200, { programs: r.programs })
    if (key === 'POST /v1/programs/deploy') return res(201, { program: 'daily_sales', version: 1, commit_sha: (call.body as { commit?: string }).commit ?? SHA })
    if (key === 'POST /v1/runs') return res(200, { run_id: 'r-1', status: 'needs_approval', step: 'write', prompt: 'Write?', data: null })
    if (key.startsWith('POST /v1/runs/') && key.endsWith('/cancel')) return res(200, { run_id: 'r-1', status: 'cancelled' })
    if (key.startsWith('POST /v1/runs/') && key.endsWith('/continue')) return res(200, { run_id: 'r-1', status: 'done', data: { ok: 1 } })
    if (key.startsWith('GET /v1/runs/') && key.endsWith('/log')) return res(200, { lines: Array.from({ length: 30 }, (_, i) => ({ i })) })
    if (key.startsWith('GET /v1/runs/')) return res(200, { run_id: 'r-1', status: 'done' })
    return res(404, { error: { code: 'E_NOT_FOUND', message: 'no route' } })
  }
  return { r, fetch }
}

export type World = ReturnType<typeof fakeWorld>

/** The Mac: which runtimes are there, the container's state, and git. */
export function fakeWorld(options: { kinds?: ('container' | 'orbstack' | 'docker')[]; macos?: string; arch?: string } = {}) {
  const kinds = options.kinds ?? ['docker']
  const w = {
    ran: [] as string[][],
    container: null as null | { running: boolean; token: string; image: string },
    fail: new Set<string>(),
    git: new Map<string, RunResult>(),
  }
  const docker = '/usr/local/bin/docker'
  const exists = async (path: string) =>
    (path === docker && (kinds.includes('docker') || kinds.includes('orbstack'))) || (path === '/usr/local/bin/container' && kinds.includes('container'))
  const run = async (argv: string[]): Promise<RunResult | null> => {
    w.ran.push(argv)
    const line = argv.join(' ')
    for (const f of w.fail) if (line.includes(f)) return ok('', 1, `failed: ${f}`)
    if (argv[0] === '/usr/bin/sw_vers') return ok(`${options.macos ?? '14.6'}\n`)
    if (argv[0] === '/usr/bin/uname') return ok(`${options.arch ?? 'arm64'}\n`)
    if (argv[0] === 'git' || argv[0] === '/bin/sh') {
      const key = argv[0] === '/bin/sh' ? 'bundle' : argv.slice(3, 5).join(' ')
      return w.git.get(key) ?? ok('', 128, `fatal: ${key}`)
    }
    const cli = argv.indexOf('--context') === 1 ? argv.slice(3) : argv.slice(1)
    if (argv[0] === '/usr/local/bin/container' && cli[0] === 'system') return ok('running')
    if (cli[0] === 'info') {
      const orb = argv[1] === '--context'
      return (orb ? kinds.includes('orbstack') : kinds.includes('docker')) ? ok('29.0\n') : ok('', 1, 'no daemon')
    }
    if (cli[0] === 'inspect') {
      const c = w.container
      return c ? ok(JSON.stringify([{ State: { Running: c.running }, Config: { Labels: { 'ai.glyphh.rrotor.local-token-sha256': c.token, 'ai.glyphh.rrotor.image': c.image } } }])) : ok('[]', 1, 'No such object')
    }
    if (cli[0] === 'rm' || cli[0] === 'delete') {
      w.container = null
      return ok()
    }
    if (cli[0] === 'run') {
      const token = argv.find(a => a.startsWith('RROTOR_LOCAL_TOKEN_SHA256='))!.split('=')[1]!
      w.container = { running: true, token, image: argv.at(-1)! }
      return ok('cid\n')
    }
    if (cli[0] === 'start' && w.container) {
      w.container.running = true
      return ok()
    }
    if (cli[0] === 'stop' && w.container) {
      w.container.running = false
      return ok()
    }
    if (cli[0] === 'image') return ok()
    return ok('', 1, `unknown ${line}`)
  }
  return { w, run, sys: { run, exists, home: async () => '/Users/t' } }
}

export function deps(options: { account?: AccountState; settings?: Partial<Settings>; world?: ReturnType<typeof fakeWorld>; rrotor?: ReturnType<typeof fakeRrotor> } = {}) {
  const world = options.world ?? fakeWorld()
  const rrotor = options.rrotor ?? fakeRrotor()
  const store = new Map<string, unknown>()
  let now = NOW
  let state = options.account ?? account({ programs: 3, runs_per_day: 2 })
  let seq = 0
  const d: Deps = {
    sys: world.sys,
    run: world.run,
    fetch: rrotor.fetch,
    server: SERVER,
    account: async () => state,
    now: async () => now,
    sleep: async ms => void (now += ms),
    store: { get: async k => store.get(k), set: async (k, v) => void store.set(k, JSON.parse(JSON.stringify(v))) },
    random: n => (seq++).toString(16).padStart(2 * n, '0'),
    sha256: async t => `sha(${t})`,
    settings: { runtime: 'auto', image: 'rrotor:dev', ...options.settings },
  }
  return { d, world, rrotor, store, setAccount: (a: AccountState) => void (state = a), advance: (ms: number) => void (now += ms) }
}
