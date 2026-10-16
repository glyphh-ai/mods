import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { actualCopy, differences, expectedCopy, filesUnder, modOf, pluginNames, render } from "../lib/shared.mjs"

const write = (root, path, text) => {
  mkdirSync(join(root, path, ".."), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** A repository in a temporary folder: shared/licence and one plugin. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "mods-"))
  write(root, "shared/licence/hooks.tsx", "atom({ plugin: '__MOD__' })\n")
  write(root, "shared/licence/vendor/ed25519.LICENSE", "MIT __MOD__\n")
  write(root, "plugins/a/.claude-plugin/plugin.json", "{}")
  write(root, "plugins/a/hooks/licence/config.ts", "export const MOD = 'a'\n")
  write(root, "plugins/notaplugin/readme.txt", "")
  return root
}

test("the plugins are the folders with a manifest", () => {
  assert.deepEqual(pluginNames(repo()), ["a"])
})

test("MOD is read from the plugin's config", () => {
  assert.equal(modOf("// x\nexport const MOD = 'ada'\n"), "ada")
  assert.throws(() => modOf("export const MOD = \"ada\""), /no `export const MOD/)
})

test("a copy has __MOD__ written in, and code says where its source is", () => {
  assert.equal(render("hooks.tsx", "'__MOD__' '__MOD__'", "a"), "// Copied from shared/licence/hooks.tsx by scripts/sync-shared.mjs: edit it there.\n'a' 'a'")
  assert.equal(render("vendor/ed25519.LICENSE", "MIT __MOD__", "a"), "MIT a")
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
