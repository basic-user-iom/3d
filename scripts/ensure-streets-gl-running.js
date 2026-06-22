#!/usr/bin/env node

/**
 * Pre-flight check: Ensure Streets GL server is running before starting 3D Viewer
 * 
 * This script checks if the Streets GL server is running, and if not,
 * starts it automatically.
 */

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 8081;
const STREETS_GL_DIR = path.join(__dirname, '..', 'streets-gl-alt');
const CHECK_TIMEOUT = 3000;
const MAX_WAIT_TIME = 60000; // Wait up to 60 seconds for server to start

/**
 * Check if server is running
 */
function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}`, { timeout: CHECK_TIMEOUT }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the server
 */
function startServer() {
  console.log(`[Pre-flight] Starting Streets GL server...`);
  
  const serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: STREETS_GL_DIR,
    stdio: 'inherit',
    shell: true,
    detached: false,
    env: { ...process.env }
  });

  return serverProcess;
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxWait = MAX_WAIT_TIME) {
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWait) {
    const isRunning = await isServerRunning();
    if (isRunning) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  return false;
}

/**
 * Main function
 */
async function main() {
  console.log(`[Pre-flight] Checking if Streets GL server is running on port ${SERVER_PORT}...`);
  
  const isRunning = await isServerRunning();
  
  if (isRunning) {
    console.log(`[Pre-flight] ✅ Streets GL server is already running!`);
    process.exit(0);
  }
  
  console.log(`[Pre-flight] ⚠️  Streets GL server is NOT running.`);
  console.log(`[Pre-flight] Starting server...`);
  
  const serverProcess = startServer();
  
  // Wait a bit for server to start
  console.log(`[Pre-flight] Waiting for server to start (max ${MAX_WAIT_TIME / 1000} seconds)...`);
  const serverReady = await waitForServer();
  
  if (serverReady) {
    console.log(`[Pre-flight] ✅ Streets GL server is now running!`);
    process.exit(0);
  } else {
    console.error(`[Pre-flight] ❌ Streets GL server failed to start within ${MAX_WAIT_TIME / 1000} seconds.`);
    console.error(`[Pre-flight] Please start it manually: cd streets-gl-alt && npm run dev`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[Pre-flight] ❌ Error:`, error);
  process.exit(1);
});

