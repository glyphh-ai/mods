// Ada, without the engine: rrotor installed and started on this Mac, the
// runtime token handed in, and the tools' work, all through `Deps`
// (rrotor's docs/architecture.md, sections 1.2, 7, 9.1 and 11). hooks.tsx
// wires it to `$`.
import type { AccountState } from '../../types'
import { access, gate, refusal } from '../licence/access.ts'
import { bundleOf, BundleError, type Run } from './bundle.ts'
import { inspectArgs, matches, parseInspect, pullArgs, removeArgs, runArgs, startArgs, stopArgs, type Wanted } from './container.ts'
import { imageOf, NO_IMAGE } from './image.ts'
import { archOf, ASSETS, fileStem, installed, NO_PART, RELEASE_PUBLIC_KEY, VERSION as PART_VERSION } from './part.ts'
import { PUBLIC_KEY as LICENCE_PUBLIC_KEY } from '../licence/server.ts'
import { client, RrotorError, type Client, type Fetch, type Health } from './rrotor.ts'
import { detect, NAMES, type Choice, type Runtime, type Sys } from './runtime.ts'

export type Local = { token: string; port: number }
export type Settings = { runtime: Choice; image: string; part: string }

export type Deps = {
  sys: Sys
  run: Run
  fetch: Fetch
  server: string
  account: () => Promise<AccountState>
  now: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  store: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> }
  random: (bytes: number) => string
  sha256: (text: string) => Promise<string>
  settings: Settings
  /** A file's text, or null; a file's bytes in base64 (a tarball), or null. */
  readText: (path: string) => Promise<string | null>
  base64Of: (path: string) => Promise<string | null>
  /** The licence as the server answered it ({payload, signature}, from ~/.glyphh/license.json), or null. */
  licence: () => Promise<unknown | null>
}

export type Outcome = { ok: true; text: string } | { ok: false; text: string }

const LOCAL_KEY = 'rrotor'
const UP_WAIT_MS = 30_000

const short = (err: unknown) => String(err instanceof Error ? err.message : err).slice(0, 300)

export function createAda(d: Deps) {
  let runtime: Runtime | null = null
  let handing: Promise<void> | null = null

  async function local(): Promise<Local> {
    const kept = (await d.store.get(LOCAL_KEY)) as Partial<Local> | undefined
    if (kept && typeof kept.token === 'string' && kept.token.length === 64 && typeof kept.port === 'number') return kept as Local
    const made = { token: d.random(32), port: 47700 + (parseInt(d.random(2), 16) % 200) }
    await d.store.set(LOCAL_KEY, made)
    return made
  }

  async function api(): Promise<Client> {
    const l = await local()
    return client(d.fetch, l.port, l.token)
  }

  async function closed(): Promise<string | null> {
    return gate(access(await d.account(), await d.now()))
  }

  async function findRuntime(): Promise<Runtime> {
    if (runtime) return runtime
    const found = await detect(d.sys, d.settings.runtime)
    if ('missing' in found) throw new Error(found.missing)
    runtime = found
    return found
  }

  async function wanted(): Promise<Wanted> {
    const image = imageOf(d.settings.image)
    if (!image) throw new Error(NO_IMAGE)
    const l = await local()
    return { image: image.image, port: l.port, server: d.server, tokenSha: await d.sha256(l.token), licenceKey: LICENCE_PUBLIC_KEY, releaseKey: RELEASE_PUBLIC_KEY }
  }

  async function sh(argv: string[], what: string): Promise<string> {
    const r = await d.run(argv)
    if (!r || r.exitCode !== 0) throw new Error(`${what}: ${(r?.stderr || r?.stdout || 'did not run').trim().split('\n').at(-1)}`)
    return r.stdout
  }

  /** rrotor running as it should: the container made (or remade) with this
   *  mod's image and local token, up and answering. */
  async function ensure(): Promise<string> {
    const rt = await findRuntime()
    const w = await wanted()
    const inspected = await d.run(inspectArgs(rt))
    const found = inspected?.exitCode === 0 ? parseInspect(inspected.stdout) : null
    if (found && matches(found, w)) {
      if (!found.running) await sh(startArgs(rt), 'rrotor did not start')
    } else {
      if (found) await sh(removeArgs(rt), 'the old rrotor could not be removed')
      if (imageOf(d.settings.image)?.pinned) await sh(pullArgs(rt, w.image), 'the rrotor image could not be pulled')
      await sh(runArgs(rt, w), 'rrotor did not start')
    }
    const c = await api()
    for (let waited = 0; !(await c.up()); waited += 500) {
      if (waited >= UP_WAIT_MS) throw new Error('rrotor started but does not answer.')
      await d.sleep(500)
    }
    await handOver(c)
    await handLicence(c)
    const part = await installPart(c)
    return `rrotor is running in ${NAMES[rt.kind]}.${part ? ` ${part}` : ''}`
  }

  /** The plan's licence, as the server signed it, handed to rrotor: it installs the Ada part and runs models only
   *  while the licence includes Ada. Handed again whenever rrotor's copy is not this one. */
  async function handLicence(c: Client): Promise<void> {
    const raw = (await d.licence()) as { payload?: { expires_at?: unknown } } | null
    if (!raw || typeof raw !== 'object' || !raw.payload) return
    const h = await c.health()
    if (h.licence && h.licence.expires_at === raw.payload.expires_at) return
    await c.putLicence(raw)
  }

  /** The Ada part, installed once per version: from the folder set in /config (a developer's build), else from this
   *  mod's release assets; nothing to do while rrotor already holds this version. */
  async function installPart(c: Client): Promise<string | null> {
    const h = await c.health()
    if (installed(h.parts)) return null
    const arch = archOf((await d.sys.run(['/usr/bin/uname', '-m']))?.stdout ?? '')
    const stem = fileStem(arch)
    const folder = d.settings.part
    if (folder) {
      const [archive, sha256, signature] = await Promise.all([d.base64Of(`${folder}/${stem}.tar.gz`), d.readText(`${folder}/${stem}.sha256`), d.readText(`${folder}/${stem}.sig`)])
      if (!archive || !sha256 || !signature) throw new Error(`The Ada part folder has no ${stem}.tar.gz with its .sha256 and .sig.`)
      await c.installPart({ name: 'ada', version: PART_VERSION, sha256: sha256.trim(), signature: signature.trim(), archive })
      return `The Ada part ${PART_VERSION} (${arch}) is installed from ${folder}.`
    }
    const asset = ASSETS[arch]
    if (!asset) throw new Error(NO_PART)
    await c.installPart({ name: 'ada', version: PART_VERSION, sha256: asset.sha256, signature: asset.signature, url: asset.url })
    return `The Ada part ${PART_VERSION} (${arch}) is installed.`
  }

  /** The runtime token, from the server with this machine's sign-in, handed
   *  to rrotor when it has none or its link was refused (asking rotates it). */
  async function handOver(c: Client): Promise<void> {
    handing ??= (async () => {
      const h = await c.health()
      if (h.link.state !== 'no_token' && h.link.state !== 'refused') return
      const install = (await d.account()).install
      if (!install) return
      const res = await d.fetch(`${d.server}/v1/runtime/local`, { method: 'POST', headers: { Authorization: `Bearer ${install.token}` } })
      if (!res.ok) throw new Error(`the Glyphh server did not give rrotor its token (${res.status})`)
      const issued = JSON.parse(res.text) as { runtime_id: string; token: string }
      await c.putToken(issued.runtime_id, issued.token)
    })().finally(() => {
      handing = null
    })
    return handing
  }

  async function guarded(work: () => Promise<Outcome>): Promise<Outcome> {
    const no = await closed()
    if (no) return { ok: false, text: no }
    try {
      return await work()
    } catch (err) {
      if (err instanceof RrotorError && err.code === 'E_RROTOR_DOWN') return { ok: false, text: `${err.message}. Run /ada start.` }
      return { ok: false, text: short(err) }
    }
  }

  const json = (value: unknown): Outcome => ({ ok: true, text: JSON.stringify(value) })

  return {
    ensure: () => guarded(async () => ({ ok: true, text: await ensure() })),

    async stop(): Promise<Outcome> {
      try {
        await sh(stopArgs(await findRuntime()), 'rrotor did not stop')
        return { ok: true, text: 'rrotor stopped. Its models and data are kept.' }
      } catch (err) {
        return { ok: false, text: short(err) }
      }
    },

    /** The Ada part installed, or installed again: /ada part. */
    part: () => guarded(async () => ({ ok: true, text: (await installPart(await api())) ?? `rrotor already holds the Ada part ${PART_VERSION}.` })),

    /** rrotor's state, or null when it is not answering. */
    async health(): Promise<Health | null> {
      try {
        const c = await api()
        const h = await c.health()
        if ((h.link.state === 'no_token' || h.link.state === 'refused') && !(await closed())) void handOver(c).catch(() => undefined)
        return h
      } catch {
        return null
      }
    },

    list: () => guarded(async () => json({ models: await (await api()).models() })),

    deploy: (input: { path?: unknown; commit?: unknown; repo?: unknown; token?: unknown }) =>
      guarded(async () => {
        const c = await api()
        const commit = typeof input.commit === 'string' ? input.commit : undefined
        if (typeof input.path === 'string' && input.path) {
          let b
          try {
            b = await bundleOf(d.run, input.path, commit)
          } catch (err) {
            if (err instanceof BundleError) return { ok: false, text: err.message }
            throw err
          }
          const over = await overAda(c, b.name)
          if (over) return { ok: false, text: over }
          return json(await c.deploy({ bundle: b.bundle, commit: b.commit }))
        }
        if (typeof input.repo === 'string' && commit) {
          return json(await c.deploy({ repo: input.repo, commit, token: typeof input.token === 'string' ? input.token : null }))
        }
        return { ok: false, text: 'ada_deploy takes a folder (path, and a commit or HEAD), or a repo and its commit.' }
      }),

    call: (input: { model?: unknown; function?: unknown; inputs?: unknown; version?: unknown }) =>
      guarded(async () => {
        if (typeof input.model !== 'string' || !input.model) return { ok: false, text: 'ada_call needs the model.' }
        const inputs = input.inputs && typeof input.inputs === 'object' ? (input.inputs as Record<string, unknown>) : {}
        const answer = await (await api()).call({
          model: input.model,
          function: typeof input.function === 'string' && input.function ? input.function : 'start',
          inputs,
          ...(typeof input.version === 'number' ? { version: input.version } : {}),
        })
        return json(answer)
      }),

    resume: (input: { run_id?: unknown; answer?: unknown }) =>
      guarded(async () => {
        if (typeof input.run_id !== 'string') return { ok: false, text: 'ada_continue needs the run_id.' }
        return json(await (await api()).resume(input.run_id, input.answer ?? null))
      }),

    status: (input: { run_id?: unknown }) =>
      guarded(async () => {
        if (typeof input.run_id !== 'string') return { ok: false, text: 'ada_run needs the run_id.' }
        const c = await api()
        const [run, log] = await Promise.all([c.status(input.run_id), c.log(input.run_id)])
        return json({ ...run, log: log.lines.slice(-20) })
      }),
  }

  async function overAda(c: Client, name: string): Promise<string | null> {
    const names = (await c.models()).map(p => p.name)
    if (names.includes(name)) return null
    return refusal(await d.account(), await d.now(), 'models', names.length)
  }
}

export type Ada = ReturnType<typeof createAda>

/** The status line: rrotor's state and the approvals waiting. */
export function statusLine(h: Health | null): string {
  if (!h) return 'rrotor ○ stopped'
  const link = h.link.state === 'online' ? 'online' : h.link.state.replace(/_/g, ' ')
  const sandbox = h.sandbox.ready ? '' : ' · sandbox not ready'
  const waiting = h.approvals ? ` · ${h.approvals} waiting for you` : ''
  return `rrotor ● ${link}${sandbox}${waiting}`
}

/** /models: what is running, and how it stands. */
export function describe(h: Health | null): string {
  if (!h) return 'rrotor is not running. /ada start starts it.'
  const layers = Object.entries(h.sandbox.layers)
    .map(([name, l]) => `${l.ok ? '✓' : '✗'} ${name}: ${l.detail}`)
    .join('\n  ')
  const parts = h.parts.length ? h.parts.map(p => `${p.name} ${p.version}`).join(', ') : 'none'
  const licence = h.licence ? `${h.licence.plan ?? '?'}${h.licence.expired ? ' (expired)' : ''}: ${h.licence.mods.join(', ') || 'no mods'}` : 'none'
  return [
    `rrotor ${h.version} · link ${h.link.state.replace(/_/g, ' ')}${h.runtime_id ? ` · runtime ${h.runtime_id}` : ''}`,
    `models: ${h.models} · waiting for you: ${h.approvals}`,
    `parts: ${parts} · licence: ${licence}`,
    `sandbox ${h.sandbox.ready ? 'ready' : 'NOT ready: runs are refused'}:\n  ${layers}`,
  ].join('\n')
}
