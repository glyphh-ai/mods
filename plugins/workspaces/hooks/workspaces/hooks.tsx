// Workspaces, wired to the engine: the one file of this module that holds `$`
// and the workspaces' state (the engine follows `$` and atoms only within the
// file whose hook received them), handing the rest Disk, App and Ctx closures.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Entry, Note } from '../../types'
import { INITIAL, refusal } from '../licence/access.ts'
import type { Ctx } from './actions.ts'
import { applyWorkspace, findFile, openPage, showFile, togglePane, type App, type MenuPane } from './desktop.ts'
import { findWorkspace, listText } from './dip.ts'
import { Editor, type Ui } from './editor.tsx'
import { loadOrSeed, type Disk } from './files.ts'

const PANE = 'workspaces'
const ORDER_KEY = 'workspaceOrder'
const DESKTOP_ONLY = 'Workspaces drives the Claude desktop app: run this in a desktop app session.'

const licence = atom({ plugin: 'workspaces', key: 'licence' } as const, INITIAL)
const entries = atom({ plugin: 'workspaces', key: 'entries' } as const, [] as Entry[])
const active = atom({ plugin: 'workspaces', key: 'active' } as const, null as string | null)
const previous = atom({ plugin: 'workspaces', key: 'previous' } as const, null as string | null)
const selected = atom({ plugin: 'workspaces', key: 'selected' } as const, null as string | null)
const note = atom({ plugin: 'workspaces', key: 'note' } as const, null as Note | null)
const openFile = atom({ plugin: 'workspaces', key: 'openFile' } as const, null as string | null)
const paneTabs = atom({ plugin: 'workspaces', key: 'paneTabs' } as const, {} as Record<string, string>)

/** The pane commands, each under its own name or, where Claude Code or
 *  another plugin has that name, its other one. */
type PaneCommand = 'files' | 'diff' | 'term' | 'browser' | 'editor'
const PANE_COMMANDS: [PaneCommand, string, string][] = [
  ['files', 'files', 'Show the Files pane as a browser (/files off hides it)'],
  ['diff', 'changes', 'Show the Changes pane (/diff off hides it)'],
  ['term', 'terminal', 'Show the Terminal pane (/term off hides it)'],
  ['browser', 'tabs', 'Show the Browser pane, or open a page in it: /browser <url> (off hides it)'],
  ['editor', 'edit', 'Open a file in the Files pane: /editor <path or name>'],
]
const MENU_OF: Record<Exclude<PaneCommand, 'editor'>, MenuPane> = { files: 'files', diff: 'changes', term: 'terminal', browser: 'browser' }

/** Registered name → the pane command it runs; rebuilt at each load. */
const commandNames: Record<string, PaneCommand> = {}

function disk($: EngineInterface): Disk {
  return {
    home: () => $.env.get('HOME'),
    read: async path => String(await $.fs.read(path)),
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    list: async dir => (await $.fs.list(dir)).filter(f => f.kind === 'file').map(f => f.name),
    remove: async path => {
      const r = await $.process.run(['/bin/rm', '-f', path])
      if (r.exitCode !== 0) throw new Error(`Could not remove ${path}: ${r.stderr.trim().slice(0, 120)}`)
    },
    order: {
      get: async () => {
        const kept = await $.store.get(ORDER_KEY)
        return Array.isArray(kept) ? kept.filter((s): s is string => typeof s === 'string') : []
      },
      set: slugs => $.store.set(ORDER_KEY, slugs),
    },
  }
}

function app($: EngineInterface): App {
  return {
    mcp: (server, tool, args) => $.mcp.call(server, tool, args),
    run: (argv, init) => $.process.run(argv, init),
    cwd: () => $.session.cwd(),
    isFile: path => $.fs.stat(path).then(st => st.kind === 'file', () => false),
    toast: text => $.ui.toast(text),
    // A prompt submitted from inside the command would wait on the command
    // itself: it goes once the command has returned.
    ask: text =>
      void $.clock.after(0, () => {
        $.prompt.submit({ text }).catch(() => $.ui.toast('The Browser pane is not available: allow mcp__Claude_Browser__preview_start'))
      }),
    paneTabs: { get: () => read($, paneTabs), set: async fn => void (await update($, paneTabs, fn)) },
    openFile: { get: () => read($, openFile), set: async fn => void (await update($, openFile, fn)) },
  }
}

function ctx($: EngineInterface): Ctx {
  return {
    disk: disk($),
    entries: { get: () => read($, entries), set: async fn => void (await update($, entries, fn)) },
    active: { get: () => read($, active), set: async fn => void (await update($, active, fn)) },
    previous: { get: () => read($, previous), set: async fn => void (await update($, previous, fn)) },
    selected: { get: () => read($, selected), set: async fn => void (await update($, selected, fn)) },
    note: { get: () => read($, note), set: async fn => void (await update($, note, fn)) },
  }
}

/** Why a gated command may not run now (the trial is over), or null. */
async function refused($: EngineInterface): Promise<string | null> {
  return refusal(await read($, licence), await $.clock.now())
}

const isDesktop = async ($: EngineInterface) => (await $.session.surfaces()).includes('desktop')

const short = (err: unknown) => String(err).replace(/^(Hooks)?Error: /, '').slice(0, 200)

async function registerCommands($: EngineInterface) {
  await $.command.register({
    name: 'workspaces',
    description: 'Edit your workspaces; key <licence> unlocks Workspaces with a licence key',
    argumentHint: '[key <licence>]',
  })
  await $.command.register({
    name: 'dip',
    description: 'Switch to a workspace: /dip 1, /dip IDE, /dip back',
    argumentHint: '<number | name | back>',
  })
  for (const [name, other, description] of PANE_COMMANDS) {
    const taken = await $.command.register({ name, description }).then(() => false, () => true)
    if (!taken) commandNames[name] = name
    else if (await $.command.register({ name: other, description }).then(() => true, () => false)) commandNames[other] = name
  }
}

/** One pane command run: `off` hides its pane; /browser <url> and /editor <name> open one. */
async function runPaneCommand($: EngineInterface, which: PaneCommand, arg: string): Promise<string> {
  const a = app($)
  if (which === 'editor') {
    if (!arg) return 'Which file? /editor <path or name>'
    const hits = await findFile(a, arg)
    if (hits.length === 0) return `No file "${arg}" under ${await $.session.cwd()}`
    if (hits.length > 1) return `Several match, say which:\n${hits.slice(0, 12).join('\n')}`
    await showFile(a, hits[0]!)
    await update($, openFile, () => hits[0]!)
    return `Editor: ${hits[0]}`
  }
  const off = arg.toLowerCase() === 'off'
  if (which === 'browser' && arg && !off) {
    const url = /^[a-z]+:/i.test(arg) ? arg : `https://${arg}`
    await openPage(a, url)
    return `Browser: ${url}`
  }
  return togglePane(a, MENU_OF[which], !off)
}

export function workspaces(on: On) {
  on('session.start', async ($, e, next) => {
    try {
      const all = await loadOrSeed(disk($))
      await update($, entries, () => all)
    } catch (err) {
      await update($, note, (): Note => ({ text: short(err), isError: true }))
    }
    await registerCommands($)
    return next(e)
  })

  on('command.run', { command: 'workspaces' }, async ($, e) => {
    if (e.args.trim()) return { text: 'Usage: /workspaces [key <licence>]' }
    const opened = await $.ui.open({ id: PANE, title: 'Workspaces' })
    return { text: opened.isPlaced ? 'Workspaces open.' : `The Workspaces pane could not be placed: ${opened.reason}` }
  })

  on('command.run', { command: 'dip' }, async ($, e) => {
    const no = await refused($)
    if (no) return { text: no }
    const all = await read($, entries)
    const want = e.args.trim()
    if (!want) return { text: all.length ? `Workspaces: ${listText(all)}` : 'No workspaces yet: /workspaces makes one.' }
    if (!(await isDesktop($))) return { text: DESKTOP_ONLY }
    const back = want.toLowerCase() === 'back'
    const from = await read($, active)
    const goBackTo = await read($, previous)
    const target = back ? all.find(x => x.file.name === goBackTo) : findWorkspace(all, want)
    if (!target) return { text: back ? 'No workspace to go back to yet.' : `No workspace "${want}". Workspaces: ${listText(all)}` }
    if (target.file.name !== from) {
      await update($, previous, () => from)
      await update($, active, () => target.file.name)
    }
    const report = await applyWorkspace(app($), target.file)
    await $.ui.close({ id: PANE })
    return { text: `→ ${target.file.name}${report ? `  ${report}` : ''}` }
  })

  on('command.run', { command: ['files', 'changes', 'diff', 'term', 'terminal', 'browser', 'tabs', 'editor', 'edit'] }, async ($, e, next) => {
    const which = commandNames[e.command]
    if (!which) return next(e)
    const no = await refused($)
    if (no) return { text: no }
    if (!(await isDesktop($))) return { text: DESKTOP_ONLY }
    try {
      return { text: await runPaneCommand($, which, e.args.trim()) }
    } catch (err) {
      return { text: `/${e.command}: ${short(err)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'workspaces' }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e as typeof e & { surface: 'mobile' })
      return <Text dimColor>Workspaces are edited on the desktop or in a terminal.</Text>
    }
    const ui: Ui = $.ui.resolve(e as typeof e & { surface: 'desktop' })
    const view = { entries: await read($, entries), selected: await read($, selected), active: await read($, active), note: await read($, note) }
    return Editor(ui, ctx($), view)
  })
}
