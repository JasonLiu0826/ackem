#!/usr/bin/env node
console.error(`
ERROR: write-patched-asar.mjs is disabled.

Manual @electron/asar extract+pack produces ~742 MB broken app.asar and prevents Ackem.exe from starting.

Use instead:
  npm run build
  npm run patch:release

Or full green rebuild:
  npm run dist:green
`)
process.exit(1)
