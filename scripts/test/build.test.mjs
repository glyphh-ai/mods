import assert from "node:assert/strict"
import { test } from "node:test"

import { ACCOUNT_MARK, MARKS, RELEASE_VALUES, applyRelease, entryFor, isShipped, marketplace, parseArgs, problems, releaseFiles, releaseFor, releaseSpecs, setConst, setJson } from "../lib/build.mjs"

test("only what a buyer needs ships", () => {
  for (const p of [".claude-plugin/plugin.json", ".mcp.json", "hooks/register.tsx", "hooks/licence/vendor/ed25519.LICENSE", "helper/viewer.mjs", "native/overlay.swift", "mcp/dist/server.mjs", "mcp/card/sign-in.html", "skills/glyphh-sign-in/SKILL.md", "types/index.d.ts", "README.md", "LICENSE"]) assert.equal(isShipped(p), true, p)
  for (const p of ["tests/flow.test.ts", "tsconfig.json", ".claude-plugin/types/claude-code/index.d.ts", ".claude-plugin/marketplace.json", "helper/debug/probe.html", "hooks/x.test.ts", "helper/.DS_Store", "release.json", "scripts/a.mjs", "mcp/src/server.ts", "mcp/test/install.test.mjs", "mcp/package.json", "mcp/build.sh"]) assert.equal(isShipped(p), false, p)
})

test("the live values come from release.json, for the modules the plugin uses", () => {
  const release = { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", plugins: { a: {}, b: { PAYMENT_LINK: "https://buy.stripe.com/b" } } }
  assert.deepEqual(releaseFor(release, "a"), { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k" })
  assert.deepEqual(releaseFor(release, "a", ["licence"]), { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k" })
  assert.deepEqual(releaseFor(release, "b", ["unlock"]), { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/b" })
  assert.deepEqual(releaseFor(release, "b", ["unlock", "overlay"]), { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/b" })
  assert.deepEqual(releaseFor(release, "c", ["unlock"]).PAYMENT_LINK, "")
  assert.deepEqual(releaseFor(release, "d", []), {})
  assert.deepEqual(releaseFor({}, "a"), { SERVER: "", PUBLIC_KEY: "" })
  assert.throws(() => releaseFor(release, "a", ["billing"]), /no release values/)
})

test("where each value goes: the licence's and the unlock's server.ts, the plugin's config.ts; the overlay has none", () => {
  assert.deepEqual([...releaseFiles(["licence"])], ["hooks/licence/server.ts"])
  assert.deepEqual([...releaseFiles(["unlock"])], ["hooks/unlock/server.ts", "hooks/unlock/config.ts"])
  assert.deepEqual([...releaseFiles(["overlay"])], [])
  assert.deepEqual(releaseSpecs(["unlock"]).map(s => [s.key, s.name]), [["SERVER", "SERVER"], ["PUBLIC_KEY", "PUBLIC_KEY"], ["PAYMENT_LINK", "PAYMENT_LINK"]])
  assert.equal(RELEASE_VALUES.unlock.find(s => s.key === "PAYMENT_LINK").perPlugin, true)
})

test("a release refuses TBD, missing, a server that isn't https, and a Stripe test link", () => {
  assert.deepEqual(problems({ SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k" }), [])
  assert.deepEqual(problems({ SERVER: "TBD", PUBLIC_KEY: "" }), ["SERVER is TBD", "PUBLIC_KEY is missing"])
  assert.deepEqual(problems({ SERVER: "http://localhost:8080", PUBLIC_KEY: "TBD" }), ["PUBLIC_KEY is TBD", "SERVER is not https"])
  assert.deepEqual(problems({ SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/abc" }), [])
  assert.deepEqual(problems({ SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/test_abc" }), ["PAYMENT_LINK is a Stripe test link"])
})

test("a constant is set only where there is exactly one", () => {
  assert.equal(setConst("export const SERVER = 'http://x'\nexport const B = 'y'\n", "SERVER", "https://api.glyphh.ai"), "export const SERVER = 'https://api.glyphh.ai'\nexport const B = 'y'\n")
  assert.equal(setConst("export const A = ''", "A", "it's"), "export const A = 'it\\'s'")
  assert.throws(() => setConst("const SERVER = 'x'", "SERVER", "y"), /found 0/)
  assert.throws(() => setConst("export const A = 'x'\nexport const A = 'y'", "A", "z"), /found 2/)
})

test("the live values go in, to every copy that holds them; a TBD keeps the dev value and is named", () => {
  const files = new Map([
    ["hooks/licence/server.ts", "export const SERVER = 'http://localhost:8080'\nexport const PUBLIC_KEY = 'dev'\n"],
    ["hooks/unlock/server.ts", "export const SERVER = 'http://localhost:8080'\nexport const PUBLIC_KEY = 'dev'\n"],
    ["hooks/unlock/config.ts", "export const MOD = 'b'\nexport const PAYMENT_LINK = 'https://buy.stripe.com/test_x'\n"],
  ])
  const live = applyRelease(files, { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "live", PAYMENT_LINK: "https://buy.stripe.com/b" })
  assert.deepEqual(live.kept, [])
  for (const f of ["hooks/licence/server.ts", "hooks/unlock/server.ts"]) assert.equal(live.files.get(f), "export const SERVER = 'https://api.glyphh.ai'\nexport const PUBLIC_KEY = 'live'\n")
  assert.equal(live.files.get("hooks/unlock/config.ts"), "export const MOD = 'b'\nexport const PAYMENT_LINK = 'https://buy.stripe.com/b'\n")
  assert.equal(files.get("hooks/licence/server.ts").includes("localhost"), true, "the input is left alone")
  const one = applyRelease(new Map([["hooks/unlock/server.ts", files.get("hooks/unlock/server.ts")]]), { SERVER: "https://api.glyphh.ai" })
  assert.match(one.files.get("hooks/unlock/server.ts"), /SERVER = 'https:\/\/api.glyphh.ai'/)
  const dry = applyRelease(files, { SERVER: "https://api.glyphh.ai", PUBLIC_KEY: "TBD", PAYMENT_LINK: "TBD" })
  assert.deepEqual(dry.kept, ["PUBLIC_KEY", "PAYMENT_LINK"])
  assert.match(dry.files.get("hooks/licence/server.ts"), /PUBLIC_KEY = 'dev'/)
  assert.match(dry.files.get("hooks/unlock/config.ts"), /test_x/)
  assert.throws(() => applyRelease(new Map(), { SERVER: "x" }), /is missing/)
  assert.throws(() => applyRelease(files, { NOPE: "x" }), /no release value named NOPE/)
})

test("release.json names the live server; the dev source keeps the dev server, in both modules", async () => {
  const { readFileSync } = await import("node:fs")
  const root = new URL("../../", import.meta.url)
  const release = JSON.parse(readFileSync(new URL("release.json", root), "utf8"))
  assert.equal(release.SERVER, "https://api.glyphh.ai")
  assert.deepEqual(Object.keys(release).sort(), ["PUBLIC_KEY", "SERVER", "plugins"])
  assert.deepEqual(Object.keys(release.plugins).sort(), ["drips", "games"])
  for (const p of Object.values(release.plugins)) assert.deepEqual(Object.keys(p), ["PAYMENT_LINK"])
  for (const f of ["shared/licence/server.ts", "shared/unlock/server.ts"]) assert.match(readFileSync(new URL(f, root), "utf8"), /^export const SERVER = 'http:\/\/localhost:8080'$/m)
})

test("the account mod's server goes into its api.ts and its .mcp.json", () => {
  assert.equal(ACCOUNT_MARK, "hooks/glyphh/api.ts")
  assert.deepEqual(MARKS, [[ACCOUNT_MARK, "account"]])
  assert.deepEqual([...releaseFiles(["account"])], ["hooks/glyphh/api.ts", ".mcp.json"])
  assert.deepEqual(releaseFor({ SERVER: "https://api.glyphh.ai" }, "glyphh", ["account"]), { SERVER: "https://api.glyphh.ai" })
  const files = new Map([
    ["hooks/glyphh/api.ts", "export const DEFAULT_SERVER = 'http://localhost:8080'\n"],
    [".mcp.json", '{\n  "mcpServers": {\n    "glyphh": {\n      "command": "node",\n      "args": ["x"]\n    }\n  }\n}\n'],
  ])
  const live = applyRelease(files, { SERVER: "https://api.glyphh.ai" })
  assert.equal(live.files.get("hooks/glyphh/api.ts"), "export const DEFAULT_SERVER = 'https://api.glyphh.ai'\n")
  assert.deepEqual(JSON.parse(live.files.get(".mcp.json")).mcpServers.glyphh, { command: "node", args: ["x"], env: { GLYPHH_SERVER_URL: "https://api.glyphh.ai" } })
  assert.equal(setJson("{}", ["a", "b"], 1), '{\n  "a": {\n    "b": 1\n  }\n}\n')
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

