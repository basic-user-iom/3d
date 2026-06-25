const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')

const VIEWER_DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000'
const STREETS_GL_PORT = 8081

let mainWindow = null
let staticStreetsServer = null
let streetsGLProcess = null

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

function createStaticFileHandler(rootDir) {
  const normalizedRoot = path.resolve(rootDir)

  return (request, response) => {
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

async function startBundledStreetsGLServer(rootDir) {
  if (staticStreetsServer) {
    const ready = await isLocalServerReachable(STREETS_GL_PORT)
    return {
      started: ready,
      message: ready
        ? `Bundled Streets GL server already running on http://127.0.0.1:${STREETS_GL_PORT}`
        : 'Bundled Streets GL server handle exists but port is not responding'
    }
  }

  await new Promise((resolve, reject) => {
    const server = http.createServer(createStaticFileHandler(rootDir))

    server.once('error', (error) => {
      reject(error)
    })

    server.listen(STREETS_GL_PORT, '127.0.0.1', () => {
      staticStreetsServer = server
      resolve()
    })
  })

  const ready = await waitForLocalServer(STREETS_GL_PORT, 10000)
  if (!ready) {
    throw new Error('Bundled Streets GL server started but did not become reachable')
  }

  return {
    started: true,
    message: `Serving bundled Streets GL assets from ${rootDir}`
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

  return {
    started: true,
    message: `Started managed Streets GL server on http://localhost:${STREETS_GL_PORT}`
  }
}

async function ensureStreetsGLServer() {
  if (await isLocalServerReachable(STREETS_GL_PORT)) {
    return {
      started: true,
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
}

function cleanupBackgroundServices() {
  stopBundledStreetsGLServer()
  stopManagedStreetsGLServer()
}

async function createMainWindow() {
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
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    await mainWindow.loadURL(VIEWER_DEV_URL)
    return
  }

  const viewerIndexPath = getViewerIndexPath()
  await mainWindow.loadFile(viewerIndexPath)
}

app.whenReady().then(async () => {
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

  // Packaged desktop: serve pre-built Streets GL assets on 8081 before the window loads.
  if (app.isPackaged) {
    try {
      const streetsGLResult = await ensureStreetsGLServer()
      console.log('[Electron] Streets GL:', streetsGLResult.message)
    } catch (error) {
      console.error(
        '[Electron] Streets GL startup failed:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', cleanupBackgroundServices)
app.on('quit', cleanupBackgroundServices)
