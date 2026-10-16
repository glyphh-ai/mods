import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { MODULES, actualCopy, commandOf, differences, expectedCopy, filesUnder, modOf, moduleNamed, modulesOf, pluginNames, render } from "../lib/shared.mjs"

const write = (root, path, text) => {
  mkdirSync(join(root, path, ".."), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** A repository in a temporary folder: the shared modules, a plugin on the
 *  sign-in (a), one on the one-time unlock (b), one on neither (c). */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "mods-"))
  write(root, "shared/licence/hooks.tsx", "atom({ plugin: '__MOD__' })\n")
  write(root, "shared/licence/vendor/ed25519.LICENSE", "MIT __MOD__\n")
  write(root, "shared/unlock/flow.ts", "const MOD = '__MOD__'\n")
  write(root, "shared/unlock/server.ts", "export const SERVER = 'http://localhost:8080'\n")
  write(root, "plugins/a/.claude-plugin/plugin.json", "{}")
  write(root, "plugins/a/hooks/licence/config.ts", "export const MOD = 'a'\n")
  write(root, "plugins/b/.claude-plugin/plugin.json", "{}")
  write(root, "plugins/b/hooks/unlock/config.ts", "export const MOD = 'b'\n")
  write(root, "plugins/c/.claude-plugin/plugin.json", "{}")
  write(root, "plugins/notaplugin/readme.txt", "")
  return root
}

test("the plugins are the folders with a manifest; none is none", () => {
  assert.deepEqual(pluginNames(repo()), ["a", "b", "c"])
  assert.deepEqual(pluginNames(mkdtempSync(join(tmpdir(), "empty-"))), [])
})

test("MOD is read from the plugin's config", () => {
  assert.equal(modOf("// x\nexport const MOD = 'ada'\n"), "ada")
  assert.throws(() => modOf("export const MOD = \"ada\""), /hooks\/licence\/config.ts has no `export const MOD/)
  assert.throws(() => modOf("", "hooks/unlock"), /hooks\/unlock\/config.ts has no/)
})

test("a copy has __MOD__ written in, and code says where its source is", () => {
  assert.equal(render("hooks.tsx", "'__MOD__' '__MOD__'", "a"), "// Copied from shared/licence/hooks.tsx by scripts/sync-shared.mjs: edit it there.\n'a' 'a'")
  assert.equal(render("vendor/ed25519.LICENSE", "MIT __MOD__", "a"), "MIT a")
  assert.equal(render("flow.ts", "'__MOD__'", "b", "shared/unlock"), "// Copied from shared/unlock/flow.ts by scripts/sync-shared.mjs: edit it there.\n'b'")
})

test("missing, changed and stray files are found; config.ts is the plugin's own", () => {
  const root = repo()
  const expected = expectedCopy(root, "a")
  assert.deepEqual([...expected.keys()], ["hooks.tsx", "vendor/ed25519.LICENSE"])
  assert.deepEqual(differences(expected, actualCopy(root, "a")), [
    { path: "hooks.tsx", kind: "missing" },
    { path: "vendor/ed25519.LICENSE", kind: "missing" },
  ])
  for (const [p, text] of expected) write(root, `plugins/a/hooks/licence/${p}`, text)
  assert.deepEqual(differences(expected, actualCopy(root, "a")), [])
  write(root, "plugins/a/hooks/licence/hooks.tsx", "edited by hand\n")
  write(root, "plugins/a/hooks/licence/old.ts", "")
  assert.deepEqual(differences(expected, actualCopy(root, "a")), [
    { path: "hooks.tsx", kind: "changed" },
    { path: "old.ts", kind: "stray" },
  ])
  assert.deepEqual(filesUnder(join(root, "nowhere")), [])
})

test("three modules: the sign-in (licence), the one-time unlock and the overlay, each copied where its config.ts is", () => {
  assert.deepEqual(MODULES.map(m => [m.name, m.shared, m.copy]), [["licence", "shared/licence", "hooks/licence"], ["unlock", "shared/unlock", "hooks/unlock"], ["overlay", "shared/overlay", "hooks/overlay"]])
  assert.equal(moduleNamed("unlock").copy, "hooks/unlock")
  assert.throws(() => moduleNamed("billing"), /no shared module/)
  const root = repo()
  assert.deepEqual(modulesOf(root, "a").map(m => m.name), ["licence"])
  assert.deepEqual(modulesOf(root, "b").map(m => m.name), ["unlock"])
  assert.deepEqual(modulesOf(root, "c"), [])
  write(root, "plugins/c/hooks/unlock/config.ts", "export const MOD = 'c'\n")
  write(root, "plugins/c/hooks/overlay/config.ts", "export const MOD = 'c'\n")
  assert.deepEqual(modulesOf(root, "c").map(m => m.name), ["unlock", "overlay"])
})

test("the unlock module's copy: its own files, its own source named, its own strays", () => {
  const root = repo()
  const unlock = moduleNamed("unlock")
  const expected = expectedCopy(root, "b", unlock)
  assert.deepEqual([...expected.keys()], ["flow.ts", "server.ts"])
  assert.equal(expected.get("flow.ts"), "// Copied from shared/unlock/flow.ts by scripts/sync-shared.mjs: edit it there.\nconst MOD = 'b'\n")
  assert.deepEqual(differences(expected, actualCopy(root, "b", unlock)).map(d => d.kind), ["missing", "missing"])
  for (const [p, text] of expected) write(root, `plugins/b/hooks/unlock/${p}`, text)
  assert.deepEqual(differences(expected, actualCopy(root, "b", unlock)), [])
  write(root, "plugins/b/hooks/unlock/hooks.tsx", "")
  assert.deepEqual(differences(expected, actualCopy(root, "b", unlock)), [{ path: "hooks.tsx", kind: "stray" }])
  // The licence module's copy is not the unlock module's business.
  assert.deepEqual(actualCopy(root, "b"), new Map())
})

test("a copy has __COMMAND__ written in from the config's COMMAND, or the MOD when it has none", () => {
  assert.equal(commandOf("export const MOD = 'drips'\nexport const COMMAND = 'drips'\n", "drips"), "drips")
  assert.equal(commandOf("export const MOD = 'b'\n", "b"), "b")
  assert.equal(render("hooks.tsx", "on('__COMMAND__') of '__MOD__'", "games", "shared/unlock", "games"), "// Copied from shared/unlock/hooks.tsx by scripts/sync-shared.mjs: edit it there.\non('games') of 'games'")
})
