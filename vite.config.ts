import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const WEB_IFC_WASM_FILES = ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc-mt.worker.js'] as const

function webIfcWasmPlugin() {
  const wasmDir = path.resolve(__dirname, 'node_modules/web-ifc')

  const copyWasmTo = (targetDir: string) => {
    fs.mkdirSync(targetDir, { recursive: true })
    for (const file of WEB_IFC_WASM_FILES) {
      const source = path.join(wasmDir, file)
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(targetDir, file))
      }
    }
  }

  return {
    name: 'web-ifc-wasm',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use('/web-ifc', (req: { url?: string }, res: any, next: () => void) => {
        const fileName = path.basename(req.url || '')
        if (!WEB_IFC_WASM_FILES.includes(fileName as typeof WEB_IFC_WASM_FILES[number])) {
          return next()
        }
        const filePath = path.join(wasmDir, fileName)
        if (!fs.existsSync(filePath)) {
          return next()
        }
        const contentType =
          fileName.endsWith('.wasm') ? 'application/wasm' :
          fileName.endsWith('.js') ? 'application/javascript' :
          'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        fs.createReadStream(filePath).pipe(res)
      })
    },
    closeBundle() {
      copyWasmTo(path.resolve(__dirname, 'dist/web-ifc'))
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  // Use relative base path so built assets work when loaded via file:// in Electron
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty dist folder to preserve desktop-build
    sourcemap: true,
    rollupOptions: {
      output: {
        // Ensure consistent asset paths
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor'
          }

          if (id.includes('/three-gpu-pathtracer/') || id.includes('/three-mesh-bvh/')) {
            return 'pathtracing-vendor'
          }

          if (id.includes('/three-stdlib/')) {
            return 'three-stdlib-vendor'
          }

          if (id.includes('/three/')) {
            return 'three-core-vendor'
          }

          if (id.includes('/@mkkellogg/gaussian-splats-3d/')) {
            return 'splat-vendor'
          }

          if (id.includes('/web-ifc/') || id.includes('/web-ifc-three/')) {
            return 'ifc-vendor'
          }

          if (
            id.includes('/3d-tiles-renderer/') ||
            id.includes('/@loaders.gl/') ||
            id.includes('/lerc/') ||
            id.includes('/pbf/')
          ) {
            return 'tiles-vendor'
          }

          if (
            id.includes('/gltf-pipeline/') ||
            id.includes('/meshoptimizer/') ||
            id.includes('/dxf-parser/') ||
            id.includes('/ktx2-encoder/')
          ) {
            return 'asset-pipeline-vendor'
          }

          if (id.includes('/jszip/') || id.includes('/pako/')) {
            return 'archive-vendor'
          }

          if (id.includes('/zustand/')) {
            return 'state-vendor'
          }

          return 'vendor'
        }
      }
    }
  },
  plugins: [
    react(),
    webIfcWasmPlugin(),
    // Optional: enable SharedArrayBuffer for Gaussian splat sort workers (better performance).
    // Without these headers, the splat viewer uses sharedMemoryForWorkers: false.
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      'streets-gl-alt': path.resolve(__dirname, './streets-gl-alt/src')
    }
  },
  server: {
    host: true,
    port: 3000,
    strictPort: false,
    open: '/',
    hmr: {
      overlay: true // Show errors in browser overlay
    },
    watch: {
      usePolling: false,
      interval: 100
    },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['ktx2-encoder'] // Exclude from pre-bundling since it uses dynamic imports
  }
})

