#!/usr/bin/env node
// Copies each shared module (shared/licence, shared/unlock, shared/overlay)
// into the plugins that use it (hooks/licence, hooks/unlock, hooks/overlay: the ones holding their own
// config.ts), __MOD__ written as the plugin's MOD; leaves each config.ts
// alone; removes stray files.
// Usage: node scripts/sync-shared.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { actualCopy, differences, expectedCopy, modulesOf, pluginNames } from "./lib/shared.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
for (const plugin of pluginNames(root)) {
  const modules = modulesOf(root, plugin)
  if (!modules.length) console.log(`${plugin}: no shared module`)
  for (const module of modules) {
    const expected = expectedCopy(root, plugin, module)
    const changes = differences(expected, actualCopy(root, plugin, module))
    for (const { path, kind } of changes) {
      const file = join(root, "plugins", plugin, module.copy, path)
      if (kind === "stray") rmSync(file)
      else {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, expected.get(path))
      }
    }
    console.log(`${plugin} ${module.copy}: ${changes.length ? changes.map(c => `${c.kind === "stray" ? "removed" : "wrote"} ${c.path}`).join(", ") : "up to date"}`)
  }
}
