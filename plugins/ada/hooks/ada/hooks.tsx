// Ada, wired to the engine: the one file of this module that holds `$`
// (the engine follows `$` and atoms only within the file whose hook received
// them), handing core.ts closures. At the session's start it installs and
// starts rrotor (when the machine is signed in and Ada is in the plan),
// registers the tools, and keeps a status line of rrotor's state and the
// approvals waiting.
import { atom, read } from 'claude-code'
import type { EngineInterface, On, PluginOptions, Timer } from 'claude-code'

import { INITIAL } from '../licence/access.ts'
import { SERVER } from '../licence/server.ts'
import { createAda, describe, statusLine, type Deps, type Outcome, type Ada, type Settings } from './core.ts'
import { settingsOf } from './settings.ts'
import { TOOLS } from './tools.ts'

const account = atom({ plugin: 'ada', key: 'account' } as const, INITIAL)

const STATUS_EVERY_MS = 5_000
let settings: Settings
let models: Ada | null = null
let watching: Timer | null = null

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

function deps($: EngineInterface): Deps {
  return {
    sys: {
      run: argv => $.process.run(argv).catch(() => null),
      exists: path => $.fs.exists(path).catch(() => false),
      home: async () => $.env.get('HOME'),
    },
    run: argv => $.process.run(argv).catch(() => null),
    fetch: (url, init) => $.http.fetch(url, init),
    server: SERVER,
    account: () => read($, account),
    now: () => $.clock.now(),
    sleep: ms => $.clock.sleep(ms),
    store: { get: key => $.store.get(key), set: (key, value) => $.store.set(key, value) },
    random: n => hex(crypto.getRandomValues(new Uint8Array(n))),
    sha256: async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))),
    settings,
    readText: path => $.fs.read(path).then(String, () => null),
    base64Of: async path => {
      const r = await $.process.run(['/usr/bin/base64', '-i', path]).catch(() => null)
      return r && r.exitCode === 0 && !r.isStdoutTruncated ? r.stdout.replace(/\s+/g, '') : null
    },
    licence: async () => {
      const home = await $.env.get('HOME')
      const text = home ? await $.fs.read(`${home}/.glyphh/license.json`).then(String, () => null) : null
      try {
        return text ? ((JSON.parse(text) as { license?: unknown }).license ?? null) : null
      } catch {
        return null
      }
    },
  }
}

const of = ($: EngineInterface) => (models ??= createAda(deps($)))
const answer = (o: Outcome) => ({ result: o.ok ? JSON.parse(o.text) : { error: o.text } })

async function watch($: EngineInterface): Promise<void> {
  $.ui.status(statusLine(await of($).health()))
}

export function ada_(on: On, options: PluginOptions) {
  settings = settingsOf(options)
  models = null

  on('session.start', async ($, e, next) => {
    models = null
    await $.command.register({ name: 'ada', description: 'rrotor and your models: status; start or stop rrotor; part installs the Ada part again; signin or signout of Glyphh', argumentHint: '[start | stop | part | signin | signout]' })
    for (const tool of TOOLS) await $.tool.register({ ...tool, isDeferred: false } as never)
    void of($)
      .ensure()
      .then(o => (o.ok ? undefined : $.ui.log(`Ada: ${o.text}`)))
      .catch(() => undefined) // the session ended while rrotor was starting
      .finally(() => void watch($).catch(() => undefined))
    watching?.cancel()
    watching = $.clock.every(STATUS_EVERY_MS, () => void watch($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'ada' }, async ($, e) => {
    const word = e.args.trim()
    if (word === 'start') return { text: (await of($).ensure()).text }
    if (word === 'stop') return { text: (await of($).stop()).text }
    if (word === 'part') return { text: (await of($).part()).text }
    if (word) return { text: 'Usage: /ada [start | stop | part | signin | signout]' }
    return { text: describe(await of($).health()) }
  })

  on('tool.call', { tool: 'mcp__ada__ada_models' }, async $ => answer(await of($).list()))
  on('tool.call', { tool: 'mcp__ada__ada_deploy' }, async ($, e) => answer(await of($).deploy((e.input ?? {}) as never)))
  on('tool.call', { tool: 'mcp__ada__ada_call' }, async ($, e) => answer(await of($).call((e.input ?? {}) as never)))
  on('tool.call', { tool: 'mcp__ada__ada_continue' }, async ($, e) => answer(await of($).resume((e.input ?? {}) as never)))
  on('tool.call', { tool: 'mcp__ada__ada_run' }, async ($, e) => answer(await of($).status((e.input ?? {}) as never)))
}

export { ada_ as ada }
