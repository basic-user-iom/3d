const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')
const { APP_ID, setupAutoUpdater } = require('./auto-updater.cjs')
const { getSafeExternalUrl } = require('./externalUrlSafety.cjs')
const {
  loadReplicateEnvFile,
  hasReplicateApiToken,
  callReplicateApi
} = require('./replicateApi.cjs')
const {
  DEFAULT_STREETS_GL_PORT,
  createStreetsGLInstanceToken,
  shouldAdoptExistingStreetsGLServer,
  tryHandleStreetsGLIdentity,
  verifyStreetsGLInstanceToken
} = require('./streetsGLServerSafety.cjs')

if (app.isPackaged) {
  app.setAppUserModelId(APP_ID)
}

const VIEWER_DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000'
const STREETS_GL_PORT = DEFAULT_STREETS_GL_PORT

let mainWindow = null
let staticStreetsServer = null
let streetsGLProcess = null
/** Actual bound port (may be ephemeral in packaged mode when 8081 is taken). */
let streetsGLBoundPort = null
/** Instance token for the Streets GL static server we own. */
let streetsGLInstanceToken = null

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function getAppRoot() {
  try {
    return app.getAppPath()
  } catch {
    return path.resolve(__dirname, '..')
  }
}

function getViewerIndexPath() {
  const candidates = [
    path.join(getAppRoot(), 'dist', 'index.html'),
    path.join(path.resolve(__dirname, '..'), 'dist', 'index.html')
  ]

  return candidates.find(pathExists) || candidates[0]
}

function getPreloadPath() {
  if (app.isPackaged) {
    return path.join(getAppRoot(), 'electron', 'preload.cjs')
  }

  return path.join(__dirname, 'preload.cjs')
}

function getStreetsGLBuildRoots() {
  const roots = []

  if (app.isPackaged) {
    // Unpacked assets are preferred for large wasm/model files when asarUnpack is configured.
    roots.push(path.join(process.resourcesPath, 'app.asar.unpacked'))
    roots.push(getAppRoot())
  } else {
    roots.push(path.resolve(__dirname, '..'))
  }

  return roots
}

function getStreetsGLBuildPath() {
  for (const root of getStreetsGLBuildRoots()) {
    const buildPath = path.join(root, 'streets-gl-alt', 'build')
    const indexPath = path.join(buildPath, 'index.html')
    if (pathExists(indexPath)) {
      return buildPath
    }
  }

  return null
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.map':
      return 'application/json; charset=utf-8'
    case '.wasm':
      return 'application/wasm'
    default:
      return 'application/octet-stream'
  }
}

function isLocalServerReachable(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        timeout: 1500
      },
      (response) => {
        response.resume()
        resolve(response.statusCode >= 200 && response.statusCode < 500)
      }
    )

    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForLocalServer(port, timeoutMs = 120000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isLocalServerReachable(port)) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return false
}

function getStreetsGLBaseUrl() {
  const port = streetsGLBoundPort || STREETS_GL_PORT
  return `http://127.0.0.1:${port}`
}

function createStaticFileHandler(rootDir, instanceToken) {
  const normalizedRoot = path.resolve(rootDir)

  return (request, response) => {
    if (tryHandleStreetsGLIdentity(request, response, instanceToken)) {
      return
    }

    const requestUrl = request.url || '/'
    const pathname = decodeURIComponent(requestUrl.split('?')[0] || '/')
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    let filePath = path.resolve(normalizedRoot, relativePath)

    if (!filePath.startsWith(normalizedRoot)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Forbidden')
      return
    }

    if (pathExists(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }

    const sendFile = (targetPath) => {
      fs.readFile(targetPath, (error, data) => {
        if (error) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('Not found')
          return
        }

        response.writeHead(200, {
          'Content-Type': getMimeType(targetPath),
          'Cache-Control': 'no-store'
        })
        response.end(data)
      })
    }

    if (pathExists(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(filePath)
      return
    }

    const fallbackIndex = path.join(normalizedRoot, 'index.html')
    if (pathExists(fallbackIndex)) {
      sendFile(fallbackIndex)
      return
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
}

async function listenBundledStreetsGLServer(rootDir, port) {
  const instanceToken = createStreetsGLInstanceToken()
  const server = http.createServer(createStaticFileHandler(rootDir, instanceToken))

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })

  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  staticStreetsServer = server
  streetsGLBoundPort = boundPort
  streetsGLInstanceToken = instanceToken

  const ready = await waitForLocalServer(boundPort, 10000)
  if (!ready) {
    throw new Error('Bundled Streets GL server started but did not become reachable')
  }

  const owned = await verifyStreetsGLInstanceToken(boundPort, instanceToken)
  if (!owned) {
    throw new Error('Bundled Streets GL identity check failed after bind')
  }

  return {
    started: true,
    port: boundPort,
    baseUrl: getStreetsGLBaseUrl(),
    message: `Serving bundled Streets GL assets from ${rootDir} on ${getStreetsGLBaseUrl()}`
  }
}

async function startBundledStreetsGLServer(rootDir) {
  if (staticStreetsServer && streetsGLBoundPort && streetsGLInstanceToken) {
    const owned = await verifyStreetsGLInstanceToken(streetsGLBoundPort, streetsGLInstanceToken)
    return {
      started: owned,
      port: streetsGLBoundPort,
      baseUrl: getStreetsGLBaseUrl(),
      message: owned
        ? `Bundled Streets GL server already running on ${getStreetsGLBaseUrl()}`
        : 'Bundled Streets GL server handle exists but identity check failed'
    }
  }

  try {
    return await listenBundledStreetsGLServer(rootDir, STREETS_GL_PORT)
  } catch (error) {
    // Packaged: if 8081 is occupied by a foreign process, bind an ephemeral port instead.
    if (app.isPackaged && error && error.code === 'EADDRINUSE') {
      console.warn(
        '[Electron] Streets GL port 8081 busy; binding ephemeral loopback port (SEC-5)'
      )
      return listenBundledStreetsGLServer(rootDir, 0)
    }
    throw error
  }
}

async function startManagedStreetsGLServer() {
  if (streetsGLProcess && !streetsGLProcess.killed) {
    const ready = await waitForLocalServer(STREETS_GL_PORT, 120000)
    return {
      started: ready,
      message: ready
        ? `Managed Streets GL server already starting on http://localhost:${STREETS_GL_PORT}`
        : 'Managed Streets GL process exists but did not become ready in time'
    }
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  streetsGLProcess = spawn(npmCommand, ['run', 'streets-gl:managed'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env },
    windowsHide: true,
    stdio: 'ignore'
  })

  streetsGLProcess.once('exit', () => {
    streetsGLProcess = null
  })

  const ready = await waitForLocalServer(STREETS_GL_PORT)
  if (!ready) {
    throw new Error('Timed out waiting for the managed Streets GL server to start')
  }

  streetsGLBoundPort = STREETS_GL_PORT
  return {
    started: true,
    port: STREETS_GL_PORT,
    baseUrl: getStreetsGLBaseUrl(),
    message: `Started managed Streets GL server on http://localhost:${STREETS_GL_PORT}`
  }
}

async function ensureStreetsGLServer() {
  const ownsServer = Boolean(
    (staticStreetsServer && streetsGLInstanceToken) ||
      (streetsGLProcess && !streetsGLProcess.killed)
  )

  if (ownsServer && streetsGLBoundPort && streetsGLInstanceToken) {
    const owned = await verifyStreetsGLInstanceToken(streetsGLBoundPort, streetsGLInstanceToken)
    if (owned) {
      return {
        started: true,
        port: streetsGLBoundPort,
        baseUrl: getStreetsGLBaseUrl(),
        message: `Streets GL server already owned on ${getStreetsGLBaseUrl()}`
      }
    }
  }

  const portReachable = await isLocalServerReachable(STREETS_GL_PORT)
  const adoptDecision = shouldAdoptExistingStreetsGLServer({
    isPackaged: app.isPackaged,
    ownsServer,
    portReachable
  })

  // SEC-5: packaged builds never adopt an arbitrary process on 8081.
  if (adoptDecision.adopt && !app.isPackaged && portReachable) {
    streetsGLBoundPort = STREETS_GL_PORT
    return {
      started: true,
      port: STREETS_GL_PORT,
      baseUrl: getStreetsGLBaseUrl(),
      message: `Streets GL server already running on http://127.0.0.1:${STREETS_GL_PORT}`
    }
  }

  if (app.isPackaged) {
    const bundledBuildPath = getStreetsGLBuildPath()
    if (bundledBuildPath) {
      return startBundledStreetsGLServer(bundledBuildPath)
    }

    return {
      started: false,
      message:
        'Bundled Streets GL assets were not found in this desktop build. Rebuild with: npm run desktop:dist'
    }
  }

  return startManagedStreetsGLServer()
}

function stopManagedStreetsGLServer() {
  if (!streetsGLProcess || streetsGLProcess.killed) {
    return
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(streetsGLProcess.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    })
  } else {
    streetsGLProcess.kill('SIGTERM')
  }

  streetsGLProcess = null
}

function stopBundledStreetsGLServer() {
  if (!staticStreetsServer) {
    return
  }

  staticStreetsServer.close()
  staticStreetsServer = null
  streetsGLBoundPort = null
  streetsGLInstanceToken = null
}

function cleanupBackgroundServices() {
  stopBundledStreetsGLServer()
  stopManagedStreetsGLServer()
}

async function createMainWindow() {
  const viewerIndexPath = app.isPackaged ? getViewerIndexPath() : null
  if (app.isPackaged && !pathExists(viewerIndexPath)) {
    throw new Error(`Viewer build not found at ${viewerIndexPath}`)
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Allow media/fullscreen for trusted embeds (YouTube); deny everything else.
  const ALLOWED_PERMISSIONS = new Set([
    'media',
    'mediaKeySystem',
    'fullscreen',
    'pointerLock',
    'clipboard-sanitized-write'
  ])
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })

  // Keep the main window on the app origin; do not allow unexpected navigations.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedAppNavigation(navigationUrl, viewerIndexPath)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) {
      if (!isAllowedAppNavigation(event.url, viewerIndexPath)) {
        event.preventDefault()
      }
      return
    }

    // Nested frames (Streets GL, hotspot iframes) may load http(s) destinations only.
    if (!isAllowedFrameNavigation(event.url)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = getSafeExternalUrl(url, { allowHttp: !app.isPackaged })
    if (safeUrl) {
      shell.openExternal(safeUrl).catch((error) => {
        console.error(
          '[Electron] Failed to open external URL:',
          error instanceof Error ? error.message : String(error)
        )
      })
    } else {
      console.warn('[Electron] Blocked unsafe external URL:', url)
    }
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    await mainWindow.loadURL(VIEWER_DEV_URL)
    return
  }

  await mainWindow.loadFile(viewerIndexPath)
}

function isAllowedFrameNavigation(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  const protocol = parsed.protocol.toLowerCase()
  if (protocol === 'https:') {
    return !parsed.username && !parsed.password && Boolean(parsed.hostname)
  }

  if (protocol === 'http:') {
    const host = parsed.hostname.toLowerCase()
    return (
      !parsed.username &&
      !parsed.password &&
      (host === 'localhost' || host === '127.0.0.1')
    )
  }

  // Packaged viewer assets may be file: subresources for local iframes.
  return protocol === 'file:' && isAllowedAppNavigation(rawUrl, getViewerIndexPath())
}

function isAllowedAppNavigation(rawUrl, viewerIndexPath) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  if (!app.isPackaged) {
    try {
      const allowed = new URL(VIEWER_DEV_URL)
      return (
        parsed.protocol === allowed.protocol &&
        parsed.hostname === allowed.hostname &&
        parsed.port === allowed.port
      )
    } catch {
      return false
    }
  }

  if (parsed.protocol !== 'file:') {
    return false
  }

  if (!viewerIndexPath) {
    return false
  }

  try {
    const allowedDir = path.dirname(path.resolve(viewerIndexPath))
    const targetPath = decodeURIComponent(parsed.pathname)
    // On Windows, file URLs look like /C:/... — normalize before compare.
    const normalizedTarget = path.resolve(process.platform === 'win32' && /^\/[A-Za-z]:\//.test(targetPath)
      ? targetPath.slice(1)
      : targetPath)
    const relative = path.relative(allowedDir, normalizedTarget)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  } catch {
    return false
  }
}

async function bootstrapDesktopApp() {
  // SEC-4: load REPLICATE_API_TOKEN for main-process proxy only (never expose to renderer).
  loadReplicateEnvFile(path.resolve(__dirname, '..'))

  ipcMain.handle('app:start-streets-gl-server', async () => {
    try {
      return await ensureStreetsGLServer()
    } catch (error) {
      return {
        started: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('app:get-streets-gl-base-url', async () => {
    try {
      if (!streetsGLBoundPort) {
        const result = await ensureStreetsGLServer()
        return {
          baseUrl: result.baseUrl || getStreetsGLBaseUrl(),
          port: result.port || streetsGLBoundPort || STREETS_GL_PORT,
          started: result.started !== false
        }
      }
      return {
        baseUrl: getStreetsGLBaseUrl(),
        port: streetsGLBoundPort,
        started: true
      }
    } catch (error) {
      return {
        baseUrl: getStreetsGLBaseUrl(),
        port: streetsGLBoundPort || STREETS_GL_PORT,
        started: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('replicate:status', async () => ({
    configured: hasReplicateApiToken()
  }))

  ipcMain.handle('replicate:request', async (_event, request) => {
    return callReplicateApi(request || {}, { rateLimitKey: 'electron' })
  })

  // Always ensure Streets GL is up before the window loads (packaged static serve,
  // unpackaged managed webpack). Avoids "localhost refused" on every reopen.
  try {
    const streetsGLResult = await ensureStreetsGLServer()
    console.log('[Electron] Streets GL:', streetsGLResult.message)
  } catch (error) {
    console.error(
      '[Electron] Streets GL startup failed:',
      error instanceof Error ? error.message : String(error)
    )
  }

  await createMainWindow()
  setupAutoUpdater()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createMainWindow()
      } catch (error) {
        console.error(
          '[Electron] Failed to recreate main window:',
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  })
}

process.on('unhandledRejection', (error) => {
  console.error(
    '[Electron] Unhandled rejection:',
    error instanceof Error ? error.stack || error.message : String(error)
  )
})

app.whenReady().then(bootstrapDesktopApp).catch((error) => {
  console.error(
    '[Electron] Startup failed:',
    error instanceof Error ? error.stack || error.message : String(error)
  )
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', cleanupBackgroundServices)
app.on('quit', cleanupBackgroundServices)
