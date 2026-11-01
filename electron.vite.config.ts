import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// MC bot 包在运行时动态 import，Vite SSR 不需要处理它们（含巨型 JSON）
const mcExternals = ['minecraft-data', 'mineflayer', 'mineflayer-pathfinder',
  'prismarine-registry', 'prismarine-block', 'prismarine-world', 'prismarine-physics',
  'prismarine-chunk', 'prismarine-biome', 'prismarine-entity', 'prismarine-item']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // 只保留单入口：多入口会让 rollup 拆出共享 chunk，
        // 而 Electron/Node 20 加载这些 ESM chunk 会崩在 cjsPreparseModuleExports。
        // sandbox worker 改由 scripts/build-sandbox-worker.mjs 用 esbuild 单独编译。
        input: { index: resolve('src/main/index.ts') },
        external: mcExternals,
        output: {
          format: 'es',
          inlineDynamicImports: true,
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          surfacePreload: resolve('src/preload/surfacePreload.ts'),
          updaterPreload: resolve('src/preload/updaterPreload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: (chunk) => {
            if (chunk.name === 'surfacePreload') return 'surfacePreload.cjs'
            if (chunk.name === 'updaterPreload') return 'updaterPreload.cjs'
            return 'index.cjs'
          }
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          startup: resolve('src/renderer/startup.html'),
          pet: resolve('src/renderer/pet.html'),
          updater: resolve('src/renderer/updater.html')
        }
      }
    }
  }
})
