import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    server: {
      port: 5273,
      strictPort: true,
      fs: {
        // Allow serving from the whole repo. index.html lives in src/renderer and
        // shared code in src/shared; an explicit allow-list replaces vite's
        // default root, so it must cover the renderer root too.
        allow: [resolve(__dirname)]
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()]
  }
})
