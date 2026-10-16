// The shared licence module and its copies: what each plugin's hooks/licence/
// must hold. Used by sync-shared.mjs (writes the copies) and check-shared.mjs
// (fails on a copy that differs).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export const SHARED = "shared/licence"
export const COPY = "hooks/licence"
/** The one file of a plugin's hooks/licence/ that is its own. */
export const OWN = "config.ts"

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

/** A plugin's MOD, read from its hooks/licence/config.ts. */
export function modOf(configText) {
  const m = /^export const MOD = '([a-z0-9-]+)'$/m.exec(configText)
  if (!m) throw new Error("hooks/licence/config.ts has no `export const MOD = '<name>'`")
  return m[1]
}

/** A shared file as a plugin carries it: __MOD__ written as the plugin's
 *  name, and a first line saying where its source is. */
export function render(path, text, mod) {
  const body = text.replaceAll("__MOD__", mod)
  return /\.(ts|tsx|mjs|js)$/.test(path) ? `// Copied from ${SHARED}/${path} by scripts/sync-shared.mjs: edit it there.\n${body}` : body
}

/** What a plugin's hooks/licence/ must hold besides its config.ts, by path. */
export function expectedCopy(root, plugin) {
  const config = readFileSync(join(root, "plugins", plugin, COPY, OWN), "utf8")
  const mod = modOf(config)
  const src = join(root, SHARED)
  return new Map(filesUnder(src).map(p => [p, render(p, readFileSync(join(src, p), "utf8"), mod)]))
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

/** A plugin's hooks/licence/ as it is on disk, by path. */
export function actualCopy(root, plugin) {
  const dir = join(root, "plugins", plugin, COPY)
  return new Map(filesUnder(dir).map(p => [p, readFileSync(join(dir, p), "utf8")]))
}
