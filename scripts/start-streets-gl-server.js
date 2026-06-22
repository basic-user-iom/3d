#!/usr/bin/env node

/**
 * Streets GL Server Manager
 * 
 * This script ensures the Streets GL server is always running.
 * It will:
 * - Start the server if it's not running
 * - Monitor the server and restart if it crashes
 * - Provide health checks
 * - Handle graceful shutdown
 */

import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREETS_GL_DIR = path.join(__dirname, '..', 'streets-gl-alt');
const SERVER_PORT = 8081;
const HEALTH_CHECK_INTERVAL = 5000; // Check every 5 seconds
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY = 3000; // Wait 3 seconds before restarting

let serverProcess = null;
let restartAttempts = 0;
let isShuttingDown = false;
let healthCheckInterval = null;

/**
 * Check if the server is responding
 */
function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the Streets GL server
 */
function startServer() {
  if (isShuttingDown) return;
  
  console.log(`[StreetsGL Manager] Starting Streets GL server on port ${SERVER_PORT}...`);
  console.log(`[StreetsGL Manager] Working directory: ${STREETS_GL_DIR}`);
  
  // Change to Streets GL directory and start the dev server
  serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: STREETS_GL_DIR,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  serverProcess.on('error', (error) => {
    console.error(`[StreetsGL Manager] ❌ Failed to start server:`, error.message);
    if (!isShuttingDown) {
      scheduleRestart();
    }
  });

  serverProcess.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    
    console.log(`[StreetsGL Manager] Server exited with code ${code}, signal ${signal}`);
    
    if (code !== 0 && code !== null) {
      console.error(`[StreetsGL Manager] ❌ Server crashed! Exit code: ${code}`);
      scheduleRestart();
    }
  });

  // Start health checking after a delay (give server time to start)
  setTimeout(() => {
    if (!isShuttingDown && !healthCheckInterval) {
      startHealthCheck();
    }
  }, 10000); // Wait 10 seconds before first health check
}

/**
 * Schedule a server restart
 */
function scheduleRestart() {
  if (isShuttingDown) return;
  
  restartAttempts++;
  
  if (restartAttempts > MAX_RESTART_ATTEMPTS) {
    console.error(`[StreetsGL Manager] ❌ Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Stopping.`);
    process.exit(1);
  }
  
  console.log(`[StreetsGL Manager] ⏳ Restarting server in ${RESTART_DELAY / 1000} seconds... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
  
  setTimeout(() => {
    if (!isShuttingDown) {
      startServer();
    }
  }, RESTART_DELAY);
}

/**
 * Start health checking
 */
function startHealthCheck() {
  if (healthCheckInterval) return;
  
  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;
    
    const isHealthy = await checkServerHealth();
    
    if (!isHealthy && serverProcess && !serverProcess.killed) {
      console.warn(`[StreetsGL Manager] ⚠️  Server health check failed. Server may be down.`);
      // Don't restart immediately - wait for process exit event
    } else if (isHealthy && restartAttempts > 0) {
      console.log(`[StreetsGL Manager] ✅ Server is healthy again!`);
      restartAttempts = 0; // Reset restart counter on success
    }
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Graceful shutdown
 */
function shutdown() {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  console.log(`[StreetsGL Manager] Shutting down...`);
  
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  if (serverProcess && !serverProcess.killed) {
    console.log(`[StreetsGL Manager] Stopping Streets GL server...`);
    serverProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log(`[StreetsGL Manager] Force killing server...`);
        serverProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGUSR2', shutdown); // Nodemon restart

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[StreetsGL Manager] ❌ Uncaught exception:`, error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[StreetsGL Manager] ❌ Unhandled rejection at:`, promise, 'reason:', reason);
});

// Start the server
console.log(`[StreetsGL Manager] 🚀 Starting Streets GL Server Manager...`);
console.log(`[StreetsGL Manager] Server will run on http://localhost:${SERVER_PORT}`);
console.log(`[StreetsGL Manager] Press Ctrl+C to stop`);

startServer();
