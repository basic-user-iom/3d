import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { spawn, type ChildProcess } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __viteConfigDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const {
  loadReplicateEnvFile,
  hasReplicateApiToken,
  callReplicateApi,
  MAX_BODY_BYTES: REPLICATE_MAX_BODY_BYTES
} = require('./electron/replicateApi.cjs') as {
  loadReplicateEnvFile: (rootDir: string) => void
  hasReplicateApiToken: () => boolean
  callReplicateApi: (
    request: { method?: unknown; path?: unknown; body?: unknown },
    options?: { rateLimitKey?: string }
  ) => Promise<{ ok: boolean; status: number; data?: unknown; error?: string }>
  MAX_BODY_BYTES: number
}

/**
 * SEC-4: Proxy Replicate through Vite so REPLICATE_API_TOKEN never enters client bundles.
 * Handles /api/replicate/* before the generic /api → :3001 proxy.
 */
function replicateApiProxyPlugin() {
  const readJsonBody = (req: any, maxBytes: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) {
          reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
          req.destroy()
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          resolve(raw ? JSON.parse(raw) : {})
        } catch {
          reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }))
        }
      })
      req.on('error', reject)
    })

  const sendJson = (res: any, status: number, payload: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(payload))
  }

  return {
    name: 'replicate-api-proxy',
    configureServer(server: { middlewares: { use: Function } }) {
      loadReplicateEnvFile(__viteConfigDir)

      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/api/replicate')) {
          return next()
        }

        if (req.method === 'GET' && (url === '/api/replicate/status' || url === '/api/replicate/status/')) {
          return sendJson(res, 200, { configured: hasReplicateApiToken() })
        }

        if (req.method === 'POST' && (url === '/api/replicate/request' || url === '/api/replicate/request/')) {
          try {
            const body = await readJsonBody(req, REPLICATE_MAX_BODY_BYTES + 64 * 1024)
            const result = await callReplicateApi(body as object, { rateLimitKey: 'vite' })
            return sendJson(res, result.ok ? 200 : result.status || 500, result)
          } catch (error: any) {
            const status = typeof error?.statusCode === 'number' ? error.statusCode : 500
            return sendJson(res, status, {
              ok: false,
              status,
              error: error instanceof Error ? error.message : 'Replicate proxy error'
            })
          }
        }

        return sendJson(res, 404, { ok: false, status: 404, error: 'Not found' })
      })
    }
  }
}

const WEB_IFC_WASM_FILES = ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc-mt.worker.js'] as const

/**
 * Ensure Streets GL (:8081) is running whenever Vite starts.
 * Safe with `npm run dev` (concurrently already starts the manager — we adopt).
 * Fixes `dev:open` / lone `vite` sessions that previously left the iframe refused.
 */
function ensureStreetsGLOnViteStartPlugin() {
  const STREETS_GL_PORT = 8081
  let managerProcess: ChildProcess | null = null

  const isReachable = () =>
    new Promise<boolean>((resolve) => {
      const req = http.get(
        { host: '127.0.0.1', port: STREETS_GL_PORT, path: '/', timeout: 2000 },
        (res) => {
          res.resume()
          resolve(true)
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    })

  return {
    name: 'ensure-streets-gl-on-vite-start',
    async configureServer(server: { httpServer?: { once: (event: string, cb: () => void) => void } | null }) {
      // Delay so `npm run dev` (concurrently) can own the managed process first.
      // If still down (e.g. `vite` / `dev:open` alone), we start it here.
      const kickoff = async () => {
        if (await isReachable()) {
          console.log(`[vite] Streets GL already running on http://127.0.0.1:${STREETS_GL_PORT}`)
          return
        }

        const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        console.log('[vite] Starting Streets GL managed server (port 8081)...')
        managerProcess = spawn(npmCommand, ['run', 'streets-gl:managed'], {
          cwd: __viteConfigDir,
          stdio: 'inherit',
          shell: true,
          env: { ...process.env }
        })

        managerProcess.on('exit', () => {
          managerProcess = null
        })
      }

      setTimeout(() => {
        void kickoff()
      }, 2500)

      server.httpServer?.once('close', () => {
        if (managerProcess && !managerProcess.killed) {
          managerProcess.kill('SIGTERM')
          managerProcess = null
        }
      })
    }
  }
}

/**
 * Host web-export preview HTML over http://localhost so YouTube embeds
 * get a valid Referer (blob: preview triggers Error 153).
 *
 * IMPORTANT: Serve preview with NO Cross-Origin-Embedder-Policy.
 * Preview omits COEP entirely (simplest path for YouTube). The main editor
 * keeps COEP credentialless for SAB and marks YouTube iframes credentialless.
 */
function webExportPreviewPlugin() {
  let latestHtml = ''
  const PREVIEW_PATH = '/__web-export-preview/'

  const readBody = (req: any): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })

  /** Strip any COEP/COOP that earlier middleware may have set. */
  const clearIsolationHeaders = (res: any) => {
    try {
      res.removeHeader('Cross-Origin-Embedder-Policy')
      res.removeHeader('Cross-Origin-Opener-Policy')
    } catch {
      // ignore
    }
  }

  return {
    name: 'web-export-preview',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const url = req.url || ''
        if (!url.startsWith(PREVIEW_PATH) && url !== PREVIEW_PATH.slice(0, -1)) {
          return next()
        }

        // POST /__web-export-preview/publish — body is raw HTML text
        if (req.method === 'POST' && (url === `${PREVIEW_PATH}publish` || url.startsWith(`${PREVIEW_PATH}publish?`))) {
          try {
            const body = await readBody(req)
            latestHtml = body.toString('utf8')
            clearIsolationHeaders(res)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, url: PREVIEW_PATH }))
          } catch (error: any) {
            clearIsolationHeaders(res)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: error?.message || 'publish failed' }))
          }
          return
        }

        // GET /__web-export-preview/ → served HTML (no COEP — required for YouTube)
        if (req.method === 'GET') {
          if (!latestHtml) {
            clearIsolationHeaders(res)
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('No web-export preview published yet. Click Preview Web Export in the app first.')
            return
          }
          clearIsolationHeaders(res)
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
          // Do NOT set Cross-Origin-Embedder-Policy — YouTube iframes need COEP absent.
          res.end(latestHtml)
          return
        }

        next()
      })
    }
  }
}

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
export default defineConfig(({ mode }) => {
  // Load non-VITE server secrets into process.env for the Replicate proxy plugin.
  const env = loadEnv(mode, __viteConfigDir, '')
  if (env.REPLICATE_API_TOKEN && !process.env.REPLICATE_API_TOKEN) {
    process.env.REPLICATE_API_TOKEN = env.REPLICATE_API_TOKEN
  }
  if (!process.env.REPLICATE_API_TOKEN && env.VITE_REPLICATE_API_TOKEN) {
    console.warn(
      '[SEC-4] VITE_REPLICATE_API_TOKEN is ignored (it would ship in client bundles). ' +
        'Rename it to REPLICATE_API_TOKEN in .env, rotate the token at Replicate, and restart Vite.'
    )
  }

  return {
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
    replicateApiProxyPlugin(),
    // Optional: enable SharedArrayBuffer for Gaussian splat sort workers (better performance).
    // Under COEP credentialless, YouTube iframes must set the iframe credentialless attribute
    // (see applyYouTubeIframeEmbedFlags). Preview at /__web-export-preview/ omits COEP entirely.
    // Registered before webExportPreviewPlugin so isolation headers are skipped early.
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0]
          const isWebExportPreview =
            url === '/__web-export-preview' ||
            url.startsWith('/__web-export-preview/')

          if (isWebExportPreview) {
            // Preview must never get COEP — YouTube embeds require it absent.
            try {
              res.removeHeader('Cross-Origin-Embedder-Policy')
              res.removeHeader('Cross-Origin-Opener-Policy')
            } catch {
              // ignore
            }
            next()
            return
          }

          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          // credentialless: SAB / cross-origin isolation; YouTube iframes use iframe.credentialless
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
          next()
        })
      }
    },
    webExportPreviewPlugin(),
    ensureStreetsGLOnViteStartPlugin()
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
    open: false,
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
      // Other /api routes (e.g. write-bug). /api/replicate/* is handled earlier by replicateApiProxyPlugin.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['ktx2-encoder'] // Exclude from pre-bundling since it uses dynamic imports
  }
  }
})

