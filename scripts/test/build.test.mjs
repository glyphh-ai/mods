import assert from "node:assert/strict"
import { test } from "node:test"

import { applyRelease, entryFor, isShipped, marketplace, parseArgs, problems, releaseFor, setConst } from "../lib/build.mjs"

test("only what a buyer needs ships", () => {
  for (const p of [".claude-plugin/plugin.json", "hooks/register.tsx", "hooks/licence/vendor/ed25519.LICENSE", "helper/viewer.mjs", "native/overlay.swift", "types/index.d.ts", "README.md", "LICENSE"]) assert.equal(isShipped(p), true, p)
  for (const p of ["tests/flow.test.ts", "tsconfig.json", ".claude-plugin/types/claude-code/index.d.ts", ".claude-plugin/marketplace.json", "helper/debug/probe.html", "hooks/x.test.ts", "helper/.DS_Store", "release.json", "scripts/a.mjs"]) assert.equal(isShipped(p), false, p)
})

test("a plugin's live values: its section over the file's own", () => {
  const release = { SITE: "https://glyphh.ai", PUBLIC_KEY: "k", plugins: { a: { PAYMENT_LINK: "https://buy.stripe.com/x" }, b: { PAYMENT_LINK: "TBD", SITE: "https://b.example" } } }
  assert.deepEqual(releaseFor(release, "a"), { SITE: "https://glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/x" })
  assert.deepEqual(releaseFor(release, "b"), { SITE: "https://b.example", PUBLIC_KEY: "k", PAYMENT_LINK: "TBD" })
  assert.throws(() => releaseFor(release, "c"), /no section for "c"/)
})

test("a release refuses TBD, missing, non-https and test values", () => {
  assert.deepEqual(problems({ SITE: "https://glyphh.ai", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/live" }), [])
  assert.deepEqual(problems({ SITE: "TBD", PUBLIC_KEY: "", PAYMENT_LINK: "TBD" }), ["SITE is TBD", "PUBLIC_KEY is missing", "PAYMENT_LINK is TBD"])
  assert.deepEqual(problems({ SITE: "http://localhost:3000", PUBLIC_KEY: "k", PAYMENT_LINK: "https://buy.stripe.com/test_abc" }), ["SITE is not https", "PAYMENT_LINK is a Stripe test link"])
})

test("a constant is set only where there is exactly one", () => {
  assert.equal(setConst("export const SITE = 'http://x'\nexport const B = 'y'\n", "SITE", "https://glyphh.ai"), "export const SITE = 'https://glyphh.ai'\nexport const B = 'y'\n")
  assert.equal(setConst("export const A = ''", "A", "it's"), "export const A = 'it\\'s'")
  assert.throws(() => setConst("const SITE = 'x'", "SITE", "y"), /found 0/)
  assert.throws(() => setConst("export const A = 'x'\nexport const A = 'y'", "A", "z"), /found 2/)
})

test("the live values go in; a TBD keeps the test value and is named", () => {
  const files = new Map([
    ["hooks/licence/site.ts", "export const SITE = 'http://localhost:3000'\nexport const PUBLIC_KEY = 'test'\n"],
    ["hooks/licence/config.ts", "export const MOD = 'a'\nexport const PAYMENT_LINK = 'https://buy.stripe.com/test_1'\n"],
  ])
  const live = applyRelease(files, { SITE: "https://glyphh.ai", PUBLIC_KEY: "live", PAYMENT_LINK: "https://buy.stripe.com/live" })
  assert.deepEqual(live.kept, [])
  assert.equal(live.files.get("hooks/licence/site.ts"), "export const SITE = 'https://glyphh.ai'\nexport const PUBLIC_KEY = 'live'\n")
  assert.match(live.files.get("hooks/licence/config.ts"), /PAYMENT_LINK = 'https:\/\/buy.stripe.com\/live'/)
  assert.equal(files.get("hooks/licence/site.ts").includes("localhost"), true, "the input is left alone")
  const dry = applyRelease(files, { SITE: "https://glyphh.ai", PUBLIC_KEY: "TBD", PAYMENT_LINK: "TBD" })
  assert.deepEqual(dry.kept, ["PUBLIC_KEY", "PAYMENT_LINK"])
  assert.match(dry.files.get("hooks/licence/site.ts"), /PUBLIC_KEY = 'test'/)
  assert.throws(() => applyRelease(new Map(), { SITE: "x" }), /site.ts is missing/)
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
