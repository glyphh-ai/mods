import assert from "node:assert/strict"
import { test } from "node:test"

import { applyRelease, entryFor, isShipped, marketplace, parseArgs, problems, releaseFor, setConst } from "../lib/build.mjs"

test("only what a buyer needs ships", () => {
  for (const p of [".claude-plugin/plugin.json", "hooks/register.tsx", "hooks/licence/vendor/ed25519.LICENSE", "helper/viewer.mjs", "native/overlay.swift", "types/index.d.ts", "README.md", "LICENSE"]) assert.equal(isShipped(p), true, p)
  for (const p of ["tests/flow.test.ts", "tsconfig.json", ".claude-plugin/types/claude-code/index.d.ts", ".claude-plugin/marketplace.json", "helper/debug/probe.html", "hooks/x.test.ts", "helper/.DS_Store", "release.json", "scripts/a.mjs"]) assert.equal(isShipped(p), false, p)
})

test("the live values come from release.json, the same for every plugin", () => {
  assert.deepEqual(releaseFor({ SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", plugins: { a: {} } }), { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k" })
  assert.deepEqual(releaseFor({}), { SERVER: "", PUBLIC_KEY: "" })
})

test("a release refuses TBD, missing, and a server that isn't https", () => {
  assert.deepEqual(problems({ SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k" }), [])
  assert.deepEqual(problems({ SERVER: "TBD", PUBLIC_KEY: "" }), ["SERVER is TBD", "PUBLIC_KEY is missing"])
  assert.deepEqual(problems({ SERVER: "http://localhost:8080", PUBLIC_KEY: "TBD" }), ["PUBLIC_KEY is TBD", "SERVER is not https"])
})

test("a constant is set only where there is exactly one", () => {
  assert.equal(setConst("export const SERVER = 'http://x'\nexport const B = 'y'\n", "SERVER", "https://api.glyphh.ai"), "export const SERVER = 'https://api.glyphh.ai'\nexport const B = 'y'\n")
  assert.equal(setConst("export const A = ''", "A", "it's"), "export const A = 'it\\'s'")
  assert.throws(() => setConst("const SERVER = 'x'", "SERVER", "y"), /found 0/)
  assert.throws(() => setConst("export const A = 'x'\nexport const A = 'y'", "A", "z"), /found 2/)
})

test("the live values go in; a TBD keeps the dev value and is named", () => {
  const files = new Map([["hooks/licence/server.ts", "export const SERVER = 'http://localhost:8080'\nexport const PUBLIC_KEY = 'dev'\n"]])
  const live = applyRelease(files, { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "live" })
  assert.deepEqual(live.kept, [])
  assert.equal(live.files.get("hooks/licence/server.ts"), "export const SERVER = 'https://api.glyphh.ai'\nexport const PUBLIC_KEY = 'live'\n")
  assert.equal(files.get("hooks/licence/server.ts").includes("localhost"), true, "the input is left alone")
  const dry = applyRelease(files, { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "TBD" })
  assert.deepEqual(dry.kept, ["PUBLIC_KEY"])
  assert.match(dry.files.get("hooks/licence/server.ts"), /SERVER = 'https:\/\/api.glyphh.ai'/)
  assert.match(dry.files.get("hooks/licence/server.ts"), /PUBLIC_KEY = 'dev'/)
  assert.throws(() => applyRelease(new Map(), { SERVER: "x" }), /server.ts is missing/)
})

test("release.json names the live server; the dev source keeps the dev server", async () => {
  const { readFileSync } = await import("node:fs")
  const root = new URL("../../", import.meta.url)
  const release = JSON.parse(readFileSync(new URL("release.json", root), "utf8"))
  assert.equal(release.SERVER, "https://api.glyphh.ai")
  assert.deepEqual(Object.keys(release).sort(), ["PUBLIC_KEY", "SERVER"])
  assert.match(readFileSync(new URL("shared/licence/server.ts", root), "utf8"), /^export const SERVER = 'http:\/\/localhost:8080'$/m)
})

test("the marketplace: entries by name, others kept, the owner always Glyphh AI", () => {
  const a = entryFor({ name: "a", version: "1.0.0", description: "A", author: {} })
  assert.deepEqual(a, { name: "a", source: "./plugins/a", description: "A", version: "1.0.0" })
  assert.throws(() => entryFor({ name: "a", description: "A" }), /no version/)
  const existing = { name: "old", description: "Glyphh mods for Claude", owner: { name: "x" }, plugins: [{ name: "z", source: "./plugins/z", version: "2.0.0" }, { name: "a", source: "./plugins/a", version: "0.9.0", category: "fun" }] }
  const m = marketplace(existing, [a])
  assert.equal(m.name, "glyphh")
  assert.deepEqual(m.owner, { name: "Glyphh AI", url: "https://glyphh.ai" })
  assert.deepEqual(m.plugins.map(p => [p.name, p.version]), [["a", "1.0.0"], ["z", "2.0.0"]])
  assert.equal(m.plugins[0].category, "fun")
  assert.deepEqual(marketplace({}, []), { name: "glyphh", description: "Glyphh mods for Claude", owner: { name: "Glyphh AI", url: "https://glyphh.ai" }, plugins: [] })
})

test("the command line", () => {
  assert.deepEqual(parseArgs(["--all", "--dry-run", "--out", "o"]), { all: true, plugins: [], dryRun: true, out: "o" })
  assert.deepEqual(parseArgs(["a", "b", "--out", "o"]), { all: false, plugins: ["a", "b"], dryRun: false, out: "o" })
  assert.throws(() => parseArgs(["--all"]), /--out/)
  assert.throws(() => parseArgs(["--out", "o"]), /or --all/)
  assert.throws(() => parseArgs(["a", "--all", "--out", "o"]), /or --all/)
  assert.throws(() => parseArgs(["--fast", "--out", "o"]), /unknown option/)
})
