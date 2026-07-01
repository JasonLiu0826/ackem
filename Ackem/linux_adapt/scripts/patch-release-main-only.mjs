#!/usr/bin/env node
console.error(`
ERROR: patch-release-main-only.mjs is disabled.

It used manual @electron/asar pack which breaks the green portable exe.

Use instead:
  npm run build
  npm run patch:release
`)
process.exit(1)
