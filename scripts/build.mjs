#!/usr/bin/env node
// Builds what buyers install: each plugin's shipped files with the live values
// from release.json, under <out>/plugins/<name>, and <out>/.claude-plugin/
// marketplace.json listing them; then `claude plugin validate` on the result.
// Refuses while a live value is TBD (or still a test value), except --dry-run,
// which keeps the test values and says which.
//
// Usage: node scripts/build.mjs <plugin...|--all> [--dry-run] --out <dir>
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { RELEASE_FILES, applyRelease, entryFor, isShipped, marketplace, parseArgs, problems, releaseFor } from "./lib/build.mjs"
import { actualCopy, differences, expectedCopy, filesUnder, pluginNames } from "./lib/shared.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const fail = message => {
  console.error(`build: ${message}`)
  process.exit(1)
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (err) {
  fail(`${err.message}\nusage: node scripts/build.mjs <plugin...|--all> [--dry-run] --out <dir>`)
}
const known = pluginNames(root)
const plugins = args.all ? known : args.plugins
for (const p of plugins) if (!known.includes(p)) fail(`no plugin "${p}" (plugins: ${known.join(", ")})`)
const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8"))
const out = resolve(args.out)

// Everything is checked before anything is written.
const plans = []
const refusals = []
for (const plugin of plugins) {
  const drift = differences(expectedCopy(root, plugin), actualCopy(root, plugin))
  if (drift.length) refusals.push(`${plugin}: hooks/licence differs from shared/licence (run node scripts/sync-shared.mjs)`)
  const values = releaseFor(release, plugin)
  const why = problems(values)
  if (why.length && !args.dryRun) refusals.push(`${plugin}: ${why.join("; ")} in release.json`)
  plans.push({ plugin, values, why })
}
if (refusals.length) fail(`not built:\n  ${refusals.join("\n  ")}`)

const entries = []
for (const { plugin, values, why } of plans) {
  const src = join(root, "plugins", plugin)
  const shipped = filesUnder(src).filter(isShipped)
  const releaseFiles = new Set(Object.values(RELEASE_FILES))
  const texts = new Map(shipped.filter(p => releaseFiles.has(p)).map(p => [p, readFileSync(join(src, p), "utf8")]))
  const { files, kept } = applyRelease(texts, values)
  const dest = join(out, "plugins", plugin)
  rmSync(dest, { recursive: true, force: true })
  for (const p of shipped) {
    mkdirSync(dirname(join(dest, p)), { recursive: true })
    writeFileSync(join(dest, p), files.get(p) ?? readFileSync(join(src, p)))
  }
  if (!shipped.includes("LICENSE")) writeFileSync(join(dest, "LICENSE"), readFileSync(join(root, "LICENSE")))
  const manifest = JSON.parse(readFileSync(join(src, ".claude-plugin", "plugin.json"), "utf8"))
  entries.push(entryFor(manifest))
  console.log(`${plugin} ${manifest.version}: ${shipped.length + (shipped.includes("LICENSE") ? 0 : 1)} files${kept.length ? ` (dry run: test ${kept.join(", ")} kept; ${why.join("; ")})` : ""}`)
}

const marketFile = join(out, ".claude-plugin", "marketplace.json")
const existing = existsSync(marketFile) ? JSON.parse(readFileSync(marketFile, "utf8")) : {}
mkdirSync(dirname(marketFile), { recursive: true })
writeFileSync(marketFile, `${JSON.stringify(marketplace(existing, entries), null, 2)}\n`)
console.log(`marketplace: ${marketFile}`)

const env = { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" }
for (const target of [...plugins.map(p => join(out, "plugins", p)), out]) {
  const r = spawnSync("claude", ["plugin", "validate", target], { env, encoding: "utf8" })
  if (r.status !== 0) fail(`claude plugin validate ${target} failed:\n${r.stdout}${r.stderr}`)
  console.log(`validated ${target}`)
}
