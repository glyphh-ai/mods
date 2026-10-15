// Drips, wired to the engine: the one file of this module that holds `$` and
// the mod's state (the engine follows `$` and atoms only within the file
// whose hook received them), handing the rest closures. It runs the Drips
// page's helper (helper/server.mjs), detached so it outlives the mod's
// reloads, and the native overlay (native/overlay.swift), one process per
// effect, over Claude's window or the whole screen. Where effects play is the
// /config row `display`. The Drips button sits in the hint line under the
// prompt; pressed, a row of quick plays opens above the prompt.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions, Timer } from 'claude-code'

import type { HelperInfo } from '../../types'
import { gateOf, INITIAL, refusal } from '../licence/access.ts'
import { BUILTIN_EFFECT_LIST, BUILTIN_EFFECTS } from './effects.ts'
import { createFun } from './fun.ts'
import { deleteCustom, dripId, listCustoms, readCustoms, saveCustom, type Store } from './library.ts'
import { HELPER_FILES, linkTo, versionOf, type Link, type PageMessage } from './link.ts'
import { createManager, customEffects, type Host, type Manager } from './manager.ts'
import { ancestorsOf, eventsOf, nativeHost, prepareOverlay, type NativeDeps, type Placement, type Prepared } from './native.ts'
import { findNode, NODE_MISSING } from './node.ts'
import { settingsOf, type Settings } from './settings.ts'
import { selectTarget, type Target, type TerminalEnv } from './target.ts'
import { showPage, shownText, type PageDeps } from './window.ts'

const account = atom({ plugin: 'drips', key: 'account' } as const, INITIAL)
const helperInfo = atom({ plugin: 'drips', key: 'helper' } as const, null as HelperInfo | null)
const pageTab = atom({ plugin: 'drips', key: 'pageTab' } as const, null as string | null)
const nodePath = atom({ plugin: 'drips', key: 'node' } as const, null as string | null)
const bandOpen = atom({ plugin: 'drips', key: 'bandOpen' } as const, false)

/** The effects the row above the prompt offers first, before the saved drips. */
export const QUICK_EFFECTS = ['fireworks', 'confetti', 'hearts', 'stars', 'gunfight']

const TOOL_PREFIX = 'mcp__drips__'
const NOT_A_RECIPE = ['save', 'delete', 'list']

/** This load's pieces: made at the session's start (a reload makes them again). */
type Mod = {
  manager: Manager
  /** The native overlay's binary, built on first use. */
  native: Promise<Prepared> | null
  /** The window Claude runs in, found on first use. */
  target: Promise<Target | null> | null
  fun: ReturnType<typeof createFun>
}
let settings: Settings
let mod: Mod | null = null
/** The helper this load talks to, and the timer that collects the page's messages. */
let helper: Link | null = null
let collecting: Timer | null = null
let starting: Promise<Link> | null = null
/** Each is said once per load: the overlay unavailable, fullscreen left out
 *  of the plan, Claude's window not found. */
let isUnavailableSaid = false
let isPlanFallbackSaid = false
let isMissedSaid = false

/** The overlay cannot run here: said once by a toast, never again by report. */
class Unavailable extends Error {}

const short = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/^(Hooks)?Error: /, '').slice(0, 300)

function store($: EngineInterface): Store {
  return { get: key => $.store.get(key), set: (key, value) => $.store.set(key, value) }
}

function pageDeps($: EngineInterface): PageDeps {
  return {
    isDesktop: async () => (await $.session.surfaces()).includes('desktop'),
    mcp: (server, tool, args) => $.mcp.call(server, tool, args),
    openExternal: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    // A prompt submitted from inside a command would wait on the command
    // itself: it goes once the command has returned.
    ask: text =>
      void $.clock.after(0, () => {
        $.prompt.submit({ text }).catch(() => $.ui.toast('The Browser pane is not available: allow mcp__Claude_Browser__preview_start'))
      }),
    link: () => startHelper($),
    tab: { get: () => read($, pageTab), set: async fn => void (await update($, pageTab, fn)) },
  }
}

function nativeDeps($: EngineInterface): NativeDeps {
  return {
    run: (argv, opts) => $.process.run(argv, opts).catch(() => null),
    spawn: (argv, input) => eventsOf($.process.spawn({ argv, input })),
    read: async path => String(await $.fs.read(path)),
    exists: path => $.fs.exists(path),
    home: () => $.env.get('HOME'),
    root: $.plugin.root,
  }
}

function build($: EngineInterface): Mod {
  const report = (err: unknown) => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`))
  const manager = createManager({
    store: store($),
    customs: () => readCustoms(store($)),
    after: (ms, fn) => void $.clock.after(ms, fn),
    report,
    changed: () => $.ui.invalidate('ui.render'), // the row's Stop comes and goes
  })
  const m: Mod = { manager, native: null, target: null, fun: null as never }
  m.fun = createFun(
    {
      isAllowed: async () => !(await refused($)),
      play: async recipe => void (await manager.execute(() => hostOf($, m), recipe)),
      ensure: async effect => manager.ensure(await hostOf($, m), effect),
      release: effect => manager.release(effect),
      after: (ms, fn) => $.clock.after(ms, fn),
      report,
    },
    settings,
  )
  return m
}

const modOf = ($: EngineInterface) => (mod ??= build($))

/** The window Claude runs in: the desktop app's, or the terminal's that
 *  hosts this session (its ancestors, as the overlay sees them, and the
 *  environment). */
async function findTarget($: EngineInterface, binary: string): Promise<Target | null> {
  const env: TerminalEnv = {
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    __CFBundleIdentifier: await $.env.get('__CFBundleIdentifier'),
    TERM: await $.env.get('TERM'),
  }
  const isDesktop = (await $.session.surfaces()).includes('desktop')
  return selectTarget({ isDesktop, env, ancestors: await ancestorsOf(nativeDeps($), binary) })
}

function placement($: EngineInterface, m: Mod, binary: string, display: 'claude-window' | 'fullscreen'): Placement {
  if (display === 'fullscreen') return { kind: 'fullscreen' }
  return {
    kind: 'window',
    target: () => (m.target ??= findTarget($, binary)),
    missed: () => {
      if (!isMissedSaid) $.ui.toast("Drips could not find Claude's window: effects play over the screen under the pointer.")
      isMissedSaid = true
    },
  }
}

/** Where effects play now: the setting's host, the native overlay. Fullscreen
 *  left out of the plan plays over Claude's window (said once). Where the
 *  overlay cannot run here (not a Mac, no Command Line Tools), nothing plays:
 *  a toast says why, once, and the play answers with the same reason. */
async function hostOf($: EngineInterface, m: Mod): Promise<Host> {
  let display = settings.display
  const planRefuses = display === 'fullscreen' ? refusal(await read($, account), await $.clock.now(), 'fullscreen') : null
  if (planRefuses) {
    if (!isPlanFallbackSaid) $.ui.toast(`${planRefuses} Playing over Claude's window instead.`)
    isPlanFallbackSaid = true
    display = 'claude-window'
  }
  m.native ??= prepareOverlay(nativeDeps($))
  const prepared = await m.native
  if ('binary' in prepared) return nativeHost(nativeDeps($), prepared.binary, placement($, m, prepared.binary, display))
  if (!isUnavailableSaid) $.ui.toast(prepared.missing)
  isUnavailableSaid = true
  throw new Unavailable(prepared.missing)
}

/** Why effects may not play now (signed out, not in the plan), or null. */
async function refused($: EngineInterface): Promise<string | null> {
  return gateOf(await read($, account), await $.clock.now())
}

/** Why saving `name` would pass the plan's `custom_drips` limit (a new name
 *  only: one saved again, or renamed, keeps the count), or null. */
async function saveRefused($: EngineInterface, name: string, original?: string | null): Promise<string | null> {
  const customs = await readCustoms(store($))
  const id = dripId(name)
  if (id in customs || (original && dripId(original) in customs)) return null
  return refusal(await read($, account), await $.clock.now(), 'custom_drips', Object.keys(customs).length)
}

// ── The Drips page's helper ─────────────────────────────────────────────────

const linkOf = ($: EngineInterface, info: HelperInfo) => linkTo((url, init) => $.http.fetch(url, init), info.port, info.token)

async function helperVersion($: EngineInterface): Promise<string> {
  const texts = []
  for (const f of HELPER_FILES) texts.push(String(await $.fs.read(`${$.plugin.root}/helper/${f}`).catch(() => '')))
  return versionOf(texts)
}

/** The page's saved recipes and effects, sent to the helper. */
async function pushLibrary($: EngineInterface): Promise<void> {
  $.ui.invalidate('ui.render') // the row above the prompt lists them too
  await helper?.library({ drips: await listCustoms(store($)), effects: BUILTIN_EFFECTS, display: settings.display })
}

/** What the page asked: a preview played, everything stopped, a recipe saved or deleted. */
async function onPage($: EngineInterface, m: PageMessage): Promise<void> {
  const { manager } = modOf($)
  if (m.t === 'stop') return manager.stopAll()
  if (m.t === 'play') {
    const no = await refused($)
    if (no) return $.ui.toast(no)
    await manager.execute(() => hostOf($, modOf($)), m.recipe, { preview: true })
    return
  }
  if (m.t === 'save') {
    if (!dripId(m.name) || customEffects(m.recipe).length === 0) return $.ui.toast('Drips: a drip needs a name and at least one effect.')
    const over = await saveRefused($, m.name, m.original)
    if (over) return $.ui.toast(over)
    if (m.original && dripId(m.original) !== dripId(m.name)) await deleteCustom(store($), m.original)
    await saveCustom(store($), m.name, m.recipe)
  } else await deleteCustom(store($), m.name)
  await pushLibrary($)
}

/** Talks to a running helper: the page's messages collected every second,
 *  which keeps it alive; one that stopped answering is let go. */
async function attach($: EngineInterface, link: Link): Promise<Link> {
  helper = link
  collecting?.cancel()
  collecting = $.clock.every(1000, () => {
    link
      .inbox()
      .then(async messages => {
        for (const m of messages) await onPage($, m).catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
      })
      .catch(async () => {
        if (helper !== link) return
        collecting?.cancel()
        helper = null
        await update($, helperInfo, () => null)
      })
  })
  await pushLibrary($)
  return link
}

/** The helper kept from before this load: found again when its code is this
 *  copy's; told to leave when it is not. */
async function reattach($: EngineInterface, version: string): Promise<Link | null> {
  const kept = await read($, helperInfo)
  if (!kept) return null
  const link = linkOf($, kept)
  const running = await link.state().then(s => s.version, () => null)
  if (running === version) return attach($, link)
  if (running !== null) await link.quit().catch(() => undefined)
  collecting?.cancel()
  helper = null
  await update($, helperInfo, () => null)
  return null
}

const randomHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')

/** The page's helper: the one running, or a new one started detached on a
 *  port and with a token chosen here; up when it answers. */
function startHelper($: EngineInterface): Promise<Link> {
  if (helper) return Promise.resolve(helper)
  starting ??= (async () => {
    const version = await helperVersion($)
    const kept = await reattach($, version)
    if (kept) return kept
    const node = await read($, nodePath)
    if (!node) throw new Error(NODE_MISSING)
    for (let attempt = 0; attempt < 2; attempt++) {
      const info: HelperInfo = { port: 20000 + (crypto.getRandomValues(new Uint16Array(1))[0]! % 40000), token: randomHex(24) }
      const launch = $.process.spawn({
        argv: [node, `${$.plugin.root}/helper/server.mjs`],
        env: { DRIPS_DETACH: '1', DRIPS_PORT: String(info.port), DRIPS_TOKEN: info.token, DRIPS_VERSION: version },
      })
      for await (const _ of launch); // the launcher starts the helper in its own session and exits
      const link = linkOf($, info)
      for (let i = 0; i < 20; i++) {
        if ((await link.state().then(s => s.version, () => null)) === version) {
          await update($, helperInfo, () => info)
          return attach($, link)
        }
        await $.clock.sleep(100)
      }
    }
    throw new Error('the Drips page did not start')
  })().finally(() => {
    starting = null
  })
  return starting
}

// ── The Drips button and its row ────────────────────────────────────────────

/** A play from the row: the plan's gate first, then the same path as /drip. */
async function bandPlay($: EngineInterface, recipe: string): Promise<void> {
  const no = await refused($)
  if (no) return $.ui.toast(no)
  const m = modOf($)
  await m.manager.execute(() => hostOf($, m), recipe).catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
}

async function bandOpenPage($: EngineInterface): Promise<void> {
  if (!(await read($, nodePath))) return $.ui.toast(NODE_MISSING)
  await showPage(pageDeps($)).catch(err => $.ui.toast(`Drips page ✗ ${short(err)}`))
}

// ── Hooks ───────────────────────────────────────────────────────────────────

async function registerAll($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'drip',
    description: 'Play a visual effect: /drip confetti, /drip 3 hearts stars, /drip -1 aurora; list, save <name> <recipe>, delete <name>, stop',
    argumentHint: '<recipe> | list | save <name> <recipe> | delete <name> | stop',
    immediate: true,
  })
  await $.command.register({ name: 'drips', description: 'Open the Drips page: your saved drips, and an editor; signin or signout of Glyphh; add the Drips add-on', argumentHint: '[signin | signout | add [confirm]]' })
  await $.tool.register({
    name: 'play_drip',
    description:
      'Play a visual effect over Claude for the person: a recipe such as "confetti", "3 hearts stars", "0.6 fireworks", ' +
      '"-1 aurora" (persistent: plays until fired again or "stop"), a saved drip\'s name, or "stop". list_drips lists the effects.',
    inputSchema: { type: 'object', properties: { recipe: { type: 'string', description: 'The drip recipe' } }, required: ['recipe'] },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'list_drips',
    description: "List the visual effects play_drip can play, and the person's saved drips.",
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  })
}

export function drips(on: On, options: PluginOptions) {
  settings = settingsOf(options)
  mod = null
  helper = null
  isUnavailableSaid = false
  isPlanFallbackSaid = false
  isMissedSaid = false

  on('session.start', async ($, e, next) => {
    mod = build($)
    await update($, nodePath, () => null)
    const node = await findNode({ run: argv => $.process.run(argv).catch(() => null) })
    await update($, nodePath, () => node)
    await reattach($, await helperVersion($)).catch(() => null) // a reload keeps the page up
    await registerAll($)
    return next(e)
  })

  on('command.run', { command: 'drip' }, async ($, e) => {
    const line = e.args.trim()
    const sub = line.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (!['list', 'save', 'delete', 'stop'].includes(sub)) {
      const no = await refused($)
      if (no) return { text: no }
    }
    if (sub === 'save') {
      const name = line.split(/\s+/)[1]
      const over = name ? await saveRefused($, name) : null
      if (over) return { text: over }
    }
    try {
      const m = modOf($)
      const text = await m.manager.execute(() => hostOf($, m), line)
      if (sub === 'save' || sub === 'delete') await pushLibrary($).catch(() => undefined)
      return { text }
    } catch (err) {
      return { text: `/drip: ${short(err)}` }
    }
  })

  on('command.run', { command: 'drips' }, async ($, e) => {
    if (e.args.trim()) return { text: 'Usage: /drips [signin | signout | add [confirm]]' }
    if (!(await read($, nodePath))) return { text: NODE_MISSING }
    try {
      return { text: shownText(await showPage(pageDeps($))) }
    } catch (err) {
      return { text: `Drips page ✗ ${short(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__drips__play_drip' }, async ($, e) => {
    const no = await refused($)
    if (no) return { result: `Not played: ${no}` }
    const recipe = String((e.input as { recipe?: unknown } | undefined)?.recipe ?? '').trim()
    if (NOT_A_RECIPE.includes(recipe.split(/\s+/)[0]?.toLowerCase() ?? '')) return { result: 'play_drip takes a recipe or "stop"; list_drips lists the effects.' }
    try {
      const m = modOf($)
      return { result: String(await m.manager.execute(() => hostOf($, m), recipe)) }
    } catch (err) {
      return { result: `Not played: ${short(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__drips__list_drips' }, async ($, e) => {
    const no = await refused($)
    if (no) return { result: `Not played: ${no}` }
    return { result: JSON.stringify({ effects: BUILTIN_EFFECT_LIST, custom: await listCustoms(store($)), running: modOf($).manager.running() }) }
  })

  // The Drips button, beside the engine's own hint under the prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await next(e)
    if (!settings.button) return line
    const { Box, Button } = $.ui.resolve(e)
    const isOpen = await read($, bandOpen)
    return (
      <Box flexDirection="row" gap={2}>
        {line}
        <Button key="drips" label="💧 Drips" plain dimColor={!isOpen} onPress={() => update($, bandOpen, v => !v)} />
      </Box>
    )
  })

  // Its row above the prompt: quick plays, the saved drips, Stop while
  // something persistent plays, ✕; the plan's offer when Drips is closed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!settings.button || e.props.hasSurvey || !(await read($, bandOpen))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const close = <Button key="close" label="✕" plain role="dismiss" onPress={() => update($, bandOpen, () => false)} />
    const no = await refused($)
    if (no) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text dimColor>💧 {no}</Text>
          <Button key="open" label="Open Drips" variant="primary" onPress={() => bandOpenPage($)} />
          {close}
        </Box>
      )
    }
    const saved = await listCustoms(store($))
    const isPlaying = modOf($).manager.running().length > 0
    return (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        <Text dimColor>💧</Text>
        {QUICK_EFFECTS.map(effect => (
          <Button key={`play:${effect}`} label={effect} onPress={() => bandPlay($, effect)} />
        ))}
        {saved.map(d => (
          <Button key={`drip:${d.name}`} label={d.name} variant="secondary" onPress={() => bandPlay($, d.name)} />
        ))}
        {isPlaying ? [<Button key="stop" label="■ Stop" onPress={() => modOf($).manager.stopAll()} />] : []}
        {close}
      </Box>
    )
  })

  // The fun hooks: each does nothing unless its /config toggle is on.
  on('tool.call', async ($, e, next) => {
    if (!settings.matrixWhileTools || e.agentId || String(e.tool).startsWith(TOOL_PREFIX)) return next(e)
    const { fun } = modOf($)
    void fun.toolStart()
    try {
      return await next(e)
    } finally {
      fun.toolEnd()
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    void modOf($)
      .fun.turnEnd({ durationMs: e.durationMs, reason: e.reason, isMainLoop: !e.agentId })
      .catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
    return next(e)
  })
}
