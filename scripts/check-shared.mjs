#!/usr/bin/env node
// Fails when a plugin's copy of a shared module (hooks/licence, hooks/unlock, hooks/overlay)
// differs from its source (run scripts/sync-shared.mjs to bring it back).
// Usage: node scripts/check-shared.mjs
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { actualCopy, differences, expectedCopy, modulesOf, pluginNames } from "./lib/shared.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let failed = false
for (const plugin of pluginNames(root)) {
  for (const module of modulesOf(root, plugin)) {
    const diffs = differences(expectedCopy(root, plugin, module), actualCopy(root, plugin, module))
    for (const d of diffs) console.error(`${plugin}: ${module.copy}/${d.path} is ${d.kind}`)
    if (diffs.length) failed = true
    else console.log(`${plugin}: ${module.copy} matches ${module.shared}`)
  }
}
if (failed) {
  console.error("A plugin's copy of a shared module differs from its source: run node scripts/sync-shared.mjs.")
  process.exit(1)
}
