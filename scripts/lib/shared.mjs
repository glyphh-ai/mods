// The shared modules and their copies: what each plugin's copy of a module
// must hold. Used by sync-shared.mjs (writes the copies), check-shared.mjs
// (fails on a copy that differs) and build.mjs (refuses a stale copy).
//
// Three modules, each copied into the plugins that use it, known by the copy's
// own config.ts being there:
//   shared/licence → hooks/licence  the Glyphh sign-in and the plan's licence
//   shared/unlock  → hooks/unlock   a one-time purchase: a Stripe Payment Link
//                                   and a licence the server signs
//   shared/overlay → hooks/overlay  the native window effects and games play in
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export const MODULES = [
  { name: "licence", shared: "shared/licence", copy: "hooks/licence" },
  { name: "unlock", shared: "shared/unlock", copy: "hooks/unlock" },
  { name: "overlay", shared: "shared/overlay", copy: "hooks/overlay" },
]
/** The one file of a plugin's copy that is its own. */
export const OWN = "config.ts"

/** A module by its name. */
export function moduleNamed(name) {
  const m = MODULES.find(x => x.name === name)
  if (!m) throw new Error(`no shared module "${name}"`)
  return m
}

/** Every file under `dir`, as paths relative to it, sorted. */
export function filesUnder(dir) {
  const out = []
  const walk = d => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name !== ".DS_Store") out.push(relative(dir, p))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

/** The plugins under plugins/, by folder name. */
export function pluginNames(root) {
  if (!existsSync(join(root, "plugins"))) return []
  return readdirSync(join(root, "plugins"))
    .filter(n => existsSync(join(root, "plugins", n, ".claude-plugin", "plugin.json")))
    .sort()
}

/** The modules a plugin uses: those whose copy holds the plugin's config.ts. */
export function modulesOf(root, plugin) {
  return MODULES.filter(m => existsSync(join(root, "plugins", plugin, m.copy, OWN)))
}

/** A plugin's MOD, read from a module's config.ts. */
export function modOf(configText, copy = MODULES[0].copy) {
  const m = /^export const MOD = '([a-z0-9-]+)'$/m.exec(configText)
  if (!m) throw new Error(`${copy}/config.ts has no \`export const MOD = '<name>'\``)
  return m[1]
}

/** A plugin's COMMAND, read from a module's config.ts: the command the
 *  module's hooks answer on (`/<COMMAND> unlock`); the MOD when it has none. */
export function commandOf(configText, mod) {
  const m = /^export const COMMAND = '([a-z0-9-]+)'$/m.exec(configText)
  return m ? m[1] : mod
}

/** A shared file as a plugin carries it: __MOD__ written as the plugin's
 *  name, __COMMAND__ as its command, and a first line saying where its source is. */
export function render(path, text, mod, shared = MODULES[0].shared, command = mod) {
  const body = text.replaceAll("__MOD__", mod).replaceAll("__COMMAND__", command)
  return /\.(ts|tsx|mjs|js)$/.test(path) ? `// Copied from ${shared}/${path} by scripts/sync-shared.mjs: edit it there.\n${body}` : body
}

/** What a plugin's copy of `module` must hold besides its config.ts, by path. */
export function expectedCopy(root, plugin, module = MODULES[0]) {
  const config = readFileSync(join(root, "plugins", plugin, module.copy, OWN), "utf8")
  const mod = modOf(config, module.copy)
  const command = commandOf(config, mod)
  const src = join(root, module.shared)
  return new Map(filesUnder(src).map(p => [p, render(p, readFileSync(join(src, p), "utf8"), mod, module.shared, command)]))
}

/** How a plugin's copy differs from the source: missing, changed and stray files. */
export function differences(expected, actual) {
  const out = []
  for (const [p, text] of expected) {
    if (!actual.has(p)) out.push({ path: p, kind: "missing" })
    else if (actual.get(p) !== text) out.push({ path: p, kind: "changed" })
  }
  for (const p of actual.keys()) if (p !== OWN && !expected.has(p)) out.push({ path: p, kind: "stray" })
  return out
}

/** A plugin's copy of `module` as it is on disk, by path. */
export function actualCopy(root, plugin, module = MODULES[0]) {
  const dir = join(root, "plugins", plugin, module.copy)
  return new Map(filesUnder(dir).map(p => [p, readFileSync(join(dir, p), "utf8")]))
}
