// The world beneath the mod at the engine's level: HOME, ~/.glyphh, the Glyphh
// server, Docker and rrotor's local API, all in memory.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { fakeRrotor, fakeWorld } from './fakes.ts'
import { accountProcess, fakeServer, seedAccount, SERVER, type Account } from './glyphh.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')
export const HOME = '/home/t'

export function world(on: On, account: Account = 'pro') {
  const glyphh = new Map<string, string>()
  seedAccount(glyphh, account, T0)
  const server = fakeServer(account)
  const mac = fakeWorld()
  const rrotor = fakeRrotor()
  const commands: string[] = []
  const tools: string[] = []
  const statuses: (string | undefined)[] = []
  const logs: string[] = []
  const writes: { argv: string[]; stdin: string }[] = []

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.read', (_$, e) => {
    const text = glyphh.get(e.path)
    if (text !== undefined) return { value: text }
    if (e.path.endsWith('/.claude-plugin/plugin.json')) return { value: '{"name":"ada","version":"0.1.0"}' }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.exists', async (_$, e) => ({ value: await mac.sys.exists(e.path) }))
  on('session.surfaces', () => ({ value: ['desktop'] as never }))
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__ada__${e.name}` } as never }
  })
  on('process.run', async (_$, e) => {
    const argv = [...e.argv]
    const mine = accountProcess(argv, e.init?.stdin, glyphh, writes)
    if (mine) return { value: mine }
    const r = await mac.run(argv)
    return { value: { exitCode: r!.exitCode, stdout: r!.stdout, stderr: r!.stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('http.fetch', async (_$, e) => {
    if (e.url.startsWith(`${SERVER}/`) && !e.url.endsWith('/v1/runtime/local')) return { value: server.handle(e.url, e.init) }
    const r = await rrotor.fetch(e.url, e.init ?? {})
    return { value: { ...r, headers: {} } }
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_$, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return { glyphh, server, mac, rrotor, commands, tools, statuses, logs }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}

export async function callTool($: Engine, tool: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return ((await $.tool.call({ tool, input } as never)) as { result?: unknown }).result
}
