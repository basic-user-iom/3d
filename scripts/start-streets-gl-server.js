#!/usr/bin/env node

/**
 * Streets GL Server Manager
 *
 * Ensures the Streets GL dev server is running on port 8081:
 * - Reuses an already-healthy server on the port (avoids EADDRINUSE restart loops)
 * - Installs streets-gl-alt dependencies when missing
 * - Waits for webpack to compile before treating startup as successful
 * - Monitors and restarts on crash
 */

import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREETS_GL_DIR = path.join(__dirname, '..', 'streets-gl-alt');
const SERVER_PORT = 8081;
const HEALTH_CHECK_INTERVAL = 5000;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY = 3000;
const STARTUP_WAIT_MS = 120000;
const HEALTH_POLL_MS = 2000;
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let serverProcess = null;
let restartAttempts = 0;
let isShuttingDown = false;
let healthCheckInterval = null;
let adoptedExternalServer = false;

function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: SERVER_PORT, path: '/', timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServerHealthy(maxWait = STARTUP_WAIT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWait) {
    if (await checkServerHealth()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  return false;
}

function ensureDependencies() {
  const nodeModules = path.join(STREETS_GL_DIR, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    return Promise.resolve();
  }

  console.log('[StreetsGL Manager] streets-gl-alt dependencies missing; running npm install...');
  return new Promise((resolve, reject) => {
    const install = spawn(NPM_COMMAND, ['install'], {
      cwd: STREETS_GL_DIR,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    });

    install.on('error', reject);
    install.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install in streets-gl-alt failed with exit code ${code}`));
      }
    });
  });
}

async function adoptExistingServerIfHealthy() {
  const healthy = await checkServerHealth();
  if (!healthy) {
    return false;
  }

  adoptedExternalServer = true;
  restartAttempts = 0;
  console.log(`[StreetsGL Manager] ✅ Streets GL already running on http://127.0.0.1:${SERVER_PORT}`);
  return true;
}

function startServer() {
  if (isShuttingDown) return;

  console.log(`[StreetsGL Manager] Starting Streets GL server on port ${SERVER_PORT}...`);
  console.log(`[StreetsGL Manager] Working directory: ${STREETS_GL_DIR}`);

  adoptedExternalServer = false;
  serverProcess = spawn(NPM_COMMAND, ['run', 'dev'], {
    cwd: STREETS_GL_DIR,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  serverProcess.on('error', (error) => {
    console.error('[StreetsGL Manager] ❌ Failed to start server:', error.message);
    if (!isShuttingDown) {
      scheduleRestart();
    }
  });

  serverProcess.on('exit', async (code, signal) => {
    if (isShuttingDown) return;

    console.log(`[StreetsGL Manager] Server exited with code ${code}, signal ${signal}`);

    if (await checkServerHealth()) {
      adoptedExternalServer = true;
      restartAttempts = 0;
      console.log('[StreetsGL Manager] Port is still serving Streets GL; monitoring existing server.');
      return;
    }

    if (code !== 0 && code !== null) {
      console.error(`[StreetsGL Manager] ❌ Server crashed! Exit code: ${code}`);
      scheduleRestart();
    }
  });
}

function scheduleRestart() {
  if (isShuttingDown) return;

  restartAttempts++;

  if (restartAttempts > MAX_RESTART_ATTEMPTS) {
    console.error(`[StreetsGL Manager] ❌ Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Stopping.`);
    process.exit(1);
  }

  console.log(
    `[StreetsGL Manager] ⏳ Restarting server in ${RESTART_DELAY / 1000} seconds... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
  );

  setTimeout(async () => {
    if (isShuttingDown) return;
    if (await adoptExistingServerIfHealthy()) {
      return;
    }
    startServer();
  }, RESTART_DELAY);
}

function startHealthCheck() {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;

    const isHealthy = await checkServerHealth();

    if (!isHealthy && serverProcess && !serverProcess.killed && !adoptedExternalServer) {
      console.warn('[StreetsGL Manager] ⚠️  Server health check failed. Server may be down.');
    } else if (isHealthy && restartAttempts > 0) {
      console.log('[StreetsGL Manager] ✅ Server is healthy again!');
      restartAttempts = 0;
    }
  }, HEALTH_CHECK_INTERVAL);
}

function shutdown() {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log('[StreetsGL Manager] Shutting down...');

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  if (adoptedExternalServer) {
    console.log('[StreetsGL Manager] Leaving externally managed Streets GL server running.');
    process.exit(0);
    return;
  }

  if (serverProcess && !serverProcess.killed) {
    console.log('[StreetsGL Manager] Stopping Streets GL server...');
    serverProcess.kill('SIGTERM');

    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log('[StreetsGL Manager] Force killing server...');
        serverProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGUSR2', shutdown);

process.on('uncaughtException', (error) => {
  console.error('[StreetsGL Manager] ❌ Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[StreetsGL Manager] ❌ Unhandled rejection at:', promise, 'reason:', reason);
});

async function main() {
  console.log('[StreetsGL Manager] 🚀 Starting Streets GL Server Manager...');
  console.log(`[StreetsGL Manager] Server will run on http://127.0.0.1:${SERVER_PORT}`);
  console.log('[StreetsGL Manager] Press Ctrl+C to stop');

  try {
    await ensureDependencies();
  } catch (error) {
    console.error('[StreetsGL Manager] ❌ Dependency install failed:', error.message);
    process.exit(1);
  }

  if (await adoptExistingServerIfHealthy()) {
    startHealthCheck();
    return;
  }

  startServer();

  const ready = await waitForServerHealthy();
  if (ready) {
    console.log('[StreetsGL Manager] ✅ Streets GL server is ready.');
    restartAttempts = 0;
    startHealthCheck();
    return;
  }

  console.warn(
    `[StreetsGL Manager] ⚠️  Server not ready after ${STARTUP_WAIT_MS / 1000}s; continuing to monitor.`
  );
  startHealthCheck();
}

main().catch((error) => {
  console.error('[StreetsGL Manager] ❌ Fatal error:', error);
  process.exit(1);
});
