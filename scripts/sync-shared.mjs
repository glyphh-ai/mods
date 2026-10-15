#!/usr/bin/env node
// Copies shared/licence/ into each plugin's hooks/licence/, __MOD__ written as
// the plugin's MOD; leaves each plugin's config.ts alone; removes stray files.
// Usage: node scripts/sync-shared.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { COPY, actualCopy, differences, expectedCopy, pluginNames } from "./lib/shared.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
for (const plugin of pluginNames(root)) {
  const expected = expectedCopy(root, plugin)
  const changes = differences(expected, actualCopy(root, plugin))
  for (const { path, kind } of changes) {
    const file = join(root, "plugins", plugin, COPY, path)
    if (kind === "stray") rmSync(file)
    else {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, expected.get(path))
    }
  }
  console.log(`${plugin}: ${changes.length ? changes.map(c => `${c.kind === "stray" ? "removed" : "wrote"} ${c.path}`).join(", ") : "up to date"}`)
}
