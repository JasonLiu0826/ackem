/**
 * Post-build script for Android target.
 *
 * 1. Fixes dist-android/index.html:
 *    - Moves <script> tags from <head> to end of <body>
 *    - Removes `type="module"` and `crossorigin` attributes (breaks file://)
 *    - Removes modulepreload links
 * 2. Copies dist-android/ → britney-android/app/src/main/assets/web/
 *    (including the boot diagnostics + shim injection in index.html)
 *
 * Usage: node scripts/post-build-android.mjs
 *
 * This script is meant to run AFTER `electron-vite build` with BUILD_TARGET=android.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const distDir = join(projectRoot, 'dist-android')
const assetsDir = join(projectRoot, 'britney-android', 'app', 'src', 'main', 'assets', 'web')

// ========== Step 1: Fix index.html ==========

function fixIndexHtml(html) {
  let patched = html

  // Remove modulepreload links
  patched = patched.replace(/<link[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '')

  // Extract all script tags from <head>
  const headScriptRegex = /<head[^>]*>([\s\S]*?)<\/head>/i
  const headMatch = patched.match(headScriptRegex)
  if (!headMatch) {
    console.warn('[post-build-android] No <head> found, skipping script move')
    return patched
  }

  const headContent = headMatch[1]
  // Find script tags with src (not inline)
  const scriptTags = []
  const scriptRegex = /<script[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi
  let m
  while ((m = scriptRegex.exec(headContent)) !== null) {
    scriptTags.push(m[0])
  }

  if (scriptTags.length === 0) {
    console.log('[post-build-android] No script tags in <head>, nothing to move')
    return patched
  }

  // Remove script tags from head
  let newHead = headContent
  for (const tag of scriptTags) {
    newHead = newHead.replace(tag, '')
  }
  patched = patched.replace(headMatch[0], `<head>${newHead}</head>`)

  // Fix script attributes: remove type="module" and crossorigin
  const fixedScripts = scriptTags.map(tag =>
    tag
      .replace(/\s+type=["']module["']/gi, '')
      .replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, '')
  )

  // Insert fixed scripts before </body>
  patched = patched.replace(/<\/body>/i, `${fixedScripts.join('\n    ')}\n  </body>`)

  console.log(`[post-build-android] Moved ${scriptTags.length} script(s) from <head> to <body>`)
  return patched
}

// ========== Step 2: Copy dist-android → assets/web ==========

function copyDirRecursive(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }

  const entries = readdirSync(src)
  for (const entry of entries) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)

    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
      console.log(`[post-build-android] Copied: ${relative(projectRoot, destPath)}`)
    }
  }
}

// ========== Main ==========

console.log('[post-build-android] Starting post-build processing...')

// Fix index.html
const indexPath = join(distDir, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`[post-build-android] ERROR: ${indexPath} not found. Did you run electron-vite build with BUILD_TARGET=android?`)
  process.exit(1)
}

let indexHtml = readFileSync(indexPath, 'utf-8')
indexHtml = fixIndexHtml(indexHtml)

// Read the boot diagnostics + shim from the existing assets/web/index.html
// We need to preserve the boot diagnostics script and shim injection
const existingAssetsIndex = join(assetsDir, 'index.html')
if (existsSync(existingAssetsIndex)) {
  const existing = readFileSync(existingAssetsIndex, 'utf-8')

  // Extract the boot diagnostics inline script from existing file
  const bootDiagMatch = existing.match(/<!--\s*=+[\s\S]*?-->\s*<script>\s*\(function[\s\S]*?<\/script>/i)
  if (bootDiagMatch) {
    console.log('[post-build-android] Found boot diagnostics script in existing assets/web/index.html')
  }

  // Check if the existing file already has scripts in body (our fix)
  const hasShimInBody = existing.includes('britney-shim.js') && existing.includes('</div>\n\n    <!-- Britney compatibility shim')
  if (hasShimInBody) {
    console.log('[post-build-android] Existing assets/web/index.html already has correct script placement')
  }
}

// Now build the final index.html for assets/web/:
// Take the fixed dist-android index.html (scripts in body, no module/crossorigin)
// and inject the boot diagnostics + shim BEFORE the main bundle script

// Read shim content
const shimPath = join(assetsDir, 'britney-shim.js')
let shimContent = ''
if (existsSync(shimPath)) {
  shimContent = readFileSync(shimPath, 'utf-8')
  console.log(`[post-build-android] Read britney-shim.js (${shimContent.length} bytes)`)
}

// The fixed index.html has scripts before </body>. We need to inject:
// 1. Boot diagnostics inline script (before shim)
// 2. Shim script reference (before main bundle)

const bootDiagScript = `    <!-- ======================================================
         Britney Android: Boot diagnostics + shim
         MUST load BEFORE main bundle (synchronous <script src>)
         ======================================================= -->
    <script>
      (function () {
        'use strict';
        if (!window.britneyBridge) {
          console.error('[BritneyBoot] FATAL: window.britneyBridge NOT found');
        } else {
          console.log('[BritneyBoot] window.britneyBridge OK');
        }
        window.addEventListener('error', function (e) {
          console.error('[BritneyBoot] Uncaught: ' + (e.message || '(no message)') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
        });
        window.addEventListener('unhandledrejection', function (e) {
          var r = e && e.reason;
          console.error('[BritneyBoot] UnhandledRejection: ' + (r && r.message ? r.message : r));
        });
        setTimeout(function () {
          var s = document.getElementById('britney-boot-splash');
          if (s && !s.classList.contains('britney-boot-splash--out')) {
            console.warn('[BritneyBoot] Boot splash still visible after 15s — force-hiding.');
            s.classList.add('britney-boot-splash--out');
          }
        }, 15000);
        console.log('[BritneyBoot] Boot diagnostics loaded');
      })();
    </script>

    <!-- Britney compatibility shim: maps window.britney -> window.britneyBridge -->
    <script src="./britney-shim.js"></script>
`

// Insert boot diagnostics + shim before the main bundle script in the fixed HTML
// The fixed HTML has: <script src="./assets/index.js"></script> before </body>
indexHtml = indexHtml.replace(
  /(<script\s+src="\.\/assets\/[^"]+\.js"><\/script>)/,
  `${bootDiagScript}\n    $1`
)

// Write to dist-android first, then copy
writeFileSync(indexPath, indexHtml, 'utf-8')
console.log(`[post-build-android] Wrote fixed index.html to ${relative(projectRoot, indexPath)}`)

// Copy everything to assets/web/
console.log(`[post-build-android] Copying dist-android → ${relative(projectRoot, assetsDir)}`)

// Clean assets/web/ first (except britney-shim.js which we preserve)
const existingFiles = readdirSync(assetsDir)
for (const f of existingFiles) {
  if (f === 'britney-shim.js') continue
  const fPath = join(assetsDir, f)
  if (statSync(fPath).isDirectory()) {
    // Remove directory recursively
    const { rmSync } = await import('node:fs')
    rmSync(fPath, { recursive: true, force: true })
  } else {
    const { rmSync } = await import('node:fs')
    rmSync(fPath, { force: true })
  }
}

copyDirRecursive(distDir, assetsDir)

console.log('[post-build-android] Done!')
console.log(`[post-build-android] Files in assets/web/: ${readdirSync(assetsDir).join(', ')}`)
