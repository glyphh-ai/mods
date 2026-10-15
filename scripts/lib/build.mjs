// What a release build does to a plugin, as pure functions: which files ship,
// the live values swapped in for the test ones, and the marketplace file.
// Used by scripts/build.mjs; tested in scripts/test/build.test.mjs.

/** What a buyer gets: these top-level entries of a plugin folder, no more. */
export const SHIPPED = [".claude-plugin", "hooks", "helper", "native", "types", "README.md", "LICENSE"]
/** Never shipped, wherever they are: tests, the engine's types, debug pages, editor files. */
const HELD_BACK = [/(^|\/)tests?\//, /\.test\.[cm]?[jt]sx?$/, /^\.claude-plugin\/types\//, /(^|\/)debug\//, /(^|\/)tsconfig[^/]*\.json$/, /(^|\/)\.DS_Store$/, /(^|\/)node_modules\//]

/** Whether a file (its path inside the plugin) goes to buyers. */
export function isShipped(path) {
  const top = path.split("/")[0]
  if (!SHIPPED.includes(top)) return false
  if (top === ".claude-plugin" && path !== ".claude-plugin/plugin.json") return false
  return !HELD_BACK.some(re => re.test(path))
}

/** The value standing for one not known yet. */
export const TBD = "TBD"
/** The live values a release swaps in: the Glyphh server and its licence key. */
export const RELEASE_KEYS = ["SERVER", "PUBLIC_KEY"]

/** The live values from release.json, the same for every plugin. */
export function releaseFor(release) {
  const values = {}
  for (const key of RELEASE_KEYS) values[key] = String(release?.[key] ?? "")
  return values
}

/** Why these values cannot ship: not known yet, or a server that isn't https. */
export function problems(values) {
  const out = []
  for (const key of RELEASE_KEYS) {
    const v = values[key]
    if (!v || v === TBD) out.push(`${key} is ${v ? TBD : "missing"}`)
  }
  if (values.SERVER && values.SERVER !== TBD && !/^https:\/\//.test(values.SERVER)) out.push("SERVER is not https")
  return out
}

/** `text` with `export const <name> = '...'` set to `value`; there must be exactly one. */
export function setConst(text, name, value) {
  const re = new RegExp(`^export const ${name} = '[^'\\n]*'$`, "gm")
  const hits = text.match(re)?.length ?? 0
  if (hits !== 1) throw new Error(`expected one \`export const ${name} = '…'\`, found ${hits}`)
  return text.replace(re, `export const ${name} = '${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`)
}

/** Where each live value lives in a plugin. */
export const RELEASE_FILES = { SERVER: "hooks/licence/server.ts", PUBLIC_KEY: "hooks/licence/server.ts" }

/**
 * The plugin's files with the live values in. A value still TBD keeps the
 * dev value (a dry run only: a release refuses before this) and is named in
 * `kept`.
 */
export function applyRelease(files, values) {
  const out = new Map(files)
  const kept = []
  for (const key of RELEASE_KEYS) {
    const path = RELEASE_FILES[key]
    if (!out.has(path)) throw new Error(`${path} is missing`)
    if (!values[key] || values[key] === TBD) kept.push(key)
    else out.set(path, setConst(out.get(path), key, values[key]))
  }
  return { files: out, kept }
}

/** A plugin's entry in the marketplace, from its manifest. */
export function entryFor(manifest) {
  for (const key of ["name", "version", "description"]) if (typeof manifest?.[key] !== "string" || !manifest[key]) throw new Error(`plugin.json has no ${key}`)
  return { name: manifest.name, source: `./plugins/${manifest.name}`, description: manifest.description, version: manifest.version }
}

/** The marketplace file, written or brought up to date: these entries in, by
 *  name; entries for plugins not built this time kept. */
export function marketplace(existing, entries) {
  const byName = new Map((Array.isArray(existing?.plugins) ? existing.plugins : []).map(p => [p.name, p]))
  for (const e of entries) byName.set(e.name, { ...byName.get(e.name), ...e })
  return {
    ...existing,
    name: "glyphh",
    description: existing?.description ?? "Glyphh mods for Claude",
    owner: { name: "Glyphh AI", url: "https://glyphh.ai" },
    plugins: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The command line: `<plugin|--all> [--dry-run] --out <dir>`. */
export function parseArgs(argv) {
  const args = { all: false, plugins: [], dryRun: false, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--all") args.all = true
    else if (a === "--dry-run") args.dryRun = true
    else if (a === "--out") args.out = argv[++i] ?? null
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`)
    else args.plugins.push(a)
  }
  if (!args.out) throw new Error("--out <dir> is required")
  if (args.all === (args.plugins.length > 0)) throw new Error("name the plugins to build, or --all")
  return args
}
