#!/usr/bin/env node
// Fails when a plugin's hooks/licence/ differs from shared/licence/ (run
// scripts/sync-shared.mjs to bring it back). Usage: node scripts/check-shared.mjs
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { SHARED, actualCopy, differences, expectedCopy, pluginNames } from "./lib/shared.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let failed = false
for (const plugin of pluginNames(root)) {
  const diffs = differences(expectedCopy(root, plugin), actualCopy(root, plugin))
  for (const d of diffs) console.error(`${plugin}: hooks/licence/${d.path} is ${d.kind}`)
  if (diffs.length) failed = true
  else console.log(`${plugin}: matches ${SHARED}`)
}
if (failed) {
  console.error("A plugin's licence copy differs from shared/licence: run node scripts/sync-shared.mjs.")
  process.exit(1)
}
