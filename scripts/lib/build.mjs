// What a release build does to a plugin, as pure functions: which files ship,
// the live values swapped in for the test ones, and the marketplace file.
// Used by scripts/build.mjs; tested in scripts/test/build.test.mjs.

/** What a buyer gets: these top-level entries of a plugin folder, no more. */
export const SHIPPED = [".claude-plugin", ".mcp.json", "hooks", "helper", "native", "mcp", "skills", "types", "README.md", "LICENSE"]
/** Never shipped, wherever they are: tests, the engine's types, debug pages, editor files. */
const HELD_BACK = [/(^|\/)tests?\//, /\.test\.[cm]?[jt]sx?$/, /^\.claude-plugin\/types\//, /(^|\/)debug\//, /(^|\/)tsconfig[^/]*\.json$/, /(^|\/)\.DS_Store$/, /(^|\/)node_modules\//, /^mcp\/(src|test|package\.json|package-lock\.json|build\.sh)/]

/** Whether a file (its path inside the plugin) goes to buyers. */
export function isShipped(path) {
  const top = path.split("/")[0]
  if (!SHIPPED.includes(top)) return false
  if (top === ".claude-plugin" && path !== ".claude-plugin/plugin.json") return false
  return !HELD_BACK.some(re => re.test(path))
}

/** The value standing for one not known yet. */
export const TBD = "TBD"

/**
 * The live values a release swaps in, by shared module: each one's key in
 * release.json, the file of the plugin's copy it lives in and the constant
 * it sets there. A per-plugin value is read from release.json's
 * `plugins.<plugin>`; the others from its top level.
 *   licence: the Glyphh server (SERVER) and the key it signs licences with (PUBLIC_KEY)
 *   unlock:  the same server and key (it signs one-time licences too), and
 *            each plugin's Stripe Payment Link (PAYMENT_LINK)
 */
export const RELEASE_VALUES = {
  licence: [
    { key: "SERVER", file: "hooks/licence/server.ts", name: "SERVER" },
    { key: "PUBLIC_KEY", file: "hooks/licence/server.ts", name: "PUBLIC_KEY" },
  ],
  unlock: [
    { key: "SERVER", file: "hooks/unlock/server.ts", name: "SERVER" },
    { key: "PUBLIC_KEY", file: "hooks/unlock/server.ts", name: "PUBLIC_KEY" },
    { key: "PAYMENT_LINK", file: "hooks/unlock/config.ts", name: "PAYMENT_LINK", perPlugin: true },
  ],
  // The overlay has no live values: it is the same in development and release.
  overlay: [],
  // The glyphh mod is the account itself, on no shared module: the server it
  // talks to is DEFAULT_SERVER in its api.ts, and GLYPHH_SERVER_URL in the
  // environment .mcp.json gives its sign-in card's MCP server.
  account: [
    { key: "SERVER", file: "hooks/glyphh/api.ts", name: "DEFAULT_SERVER" },
    { key: "SERVER", file: ".mcp.json", json: ["mcpServers", "glyphh", "env", "GLYPHH_SERVER_URL"] },
  ],
}

/** The file that marks a plugin as the account mod, using the `account` release values. */
export const ACCOUNT_MARK = "hooks/glyphh/api.ts"
/** The modules a plugin uses beyond its shared copies, by the file that marks each. */
export const MARKS = [[ACCOUNT_MARK, "account"]]

/** `text` (a JSON document) with the value at `path` set; objects on the way are made. */
export function setJson(text, path, value) {
  const doc = JSON.parse(text)
  let at = doc
  for (const key of path.slice(0, -1)) at = at[key] ??= {}
  at[path[path.length - 1]] = value
  return `${JSON.stringify(doc, null, 2)}\n`
}

/** Where each live value goes, for the modules a plugin uses (by name). */
export function releaseSpecs(modules) {
  return modules.flatMap(m => {
    const specs = RELEASE_VALUES[m]
    if (!specs) throw new Error(`no release values for module "${m}"`)
    return specs
  })
}

/** The files a release rewrites, for the modules a plugin uses. */
export function releaseFiles(modules) {
  return new Set(releaseSpecs(modules).map(s => s.file))
}

/** A plugin's live values from release.json, for the modules it uses. */
export function releaseFor(release, plugin, modules = ["licence"]) {
  const values = {}
  for (const spec of releaseSpecs(modules)) {
    const from = spec.perPlugin ? release?.plugins?.[plugin] : release
    values[spec.key] = String(from?.[spec.key] ?? "")
  }
  return values
}


/** Why these values cannot ship: not known yet, a server that isn't https, or
 *  a Stripe test link. */
export function problems(values) {
  const out = []
  for (const [key, v] of Object.entries(values)) if (!v || v === TBD) out.push(`${key} is ${v ? TBD : "missing"}`)
  for (const key of ["SERVER"]) {
    const v = values[key]
    if (v && v !== TBD && !/^https:\/\//.test(v)) out.push(`${key} is not https`)
  }
  if (/\/test_/.test(values.PAYMENT_LINK ?? "")) out.push("PAYMENT_LINK is a Stripe test link")
  return out
}

/** `text` with `export const <name> = '...'` set to `value`; there must be exactly one. */
export function setConst(text, name, value) {
  const re = new RegExp(`^export const ${name} = '[^'\\n]*'$`, "gm")
  const hits = text.match(re)?.length ?? 0
  if (hits !== 1) throw new Error(`expected one \`export const ${name} = '…'\`, found ${hits}`)
  return text.replace(re, `export const ${name} = '${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`)
}

/**
 * The plugin's files with the live values in, for the values given (their
 * keys say which). A value still TBD keeps the dev value (a dry run only: a
 * release refuses before this) and is named in `kept`.
 */
export function applyRelease(files, values) {
  const out = new Map(files)
  const kept = []
  const specs = Object.values(RELEASE_VALUES).flat()
  for (const [key, value] of Object.entries(values)) {
    // One key may live in several modules' copies (SERVER in both licence and unlock): each file present gets it.
    const places = specs.filter(s => s.key === key)
    if (!places.length) throw new Error(`no release value named ${key}`)
    const present = places.filter(s => out.has(s.file))
    if (!present.length) throw new Error(`${places.map(s => s.file).join(" or ")} is missing`)
    if (!value || value === TBD) kept.push(key)
    else for (const spec of present) out.set(spec.file, spec.json ? setJson(out.get(spec.file), spec.json, value) : setConst(out.get(spec.file), spec.name, value))
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
