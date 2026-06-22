#!/usr/bin/env node

/**
 * Pre-flight Check for Startup Requirements
 * 
 * This script checks all requirements before starting the dev servers:
 * - Port availability (3000, 3001, 8081)
 * - Node.js and npm availability
 * - Dependencies installed (node_modules)
 * - Provides clear error messages
 */

import { execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_PORTS = [3000, 8081, 3001]; // 3001 is optional but checked
const PROJECT_ROOT = path.join(__dirname, '..');
const STREETS_GL_DIR = path.join(PROJECT_ROOT, 'streets-gl-alt');

const errors = [];
const warnings = [];

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    
    server.on('error', () => resolve(true));
  });
}

/**
 * Get process using a port (Windows)
 */
function getProcessUsingPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    if (lines.length > 0 && lines[0].trim()) {
      // Extract PID from last column
      const parts = lines[0].trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        try {
          const taskOutput = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8' });
          const taskName = taskOutput.split(',')[0].replace(/"/g, '');
          return { pid, name: taskName };
        } catch {
          return { pid, name: 'Unknown' };
        }
      }
    }
  } catch {
    // Port not in use or command failed
  }
  return null;
}

/**
 * Check Node.js and npm
 */
function checkNodeAndNpm() {
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
    console.log(`✅ Node.js: ${nodeVersion}`);
  } catch {
    errors.push('Node.js is not installed or not in PATH');
    return false;
  }

  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    console.log(`✅ npm: ${npmVersion}`);
  } catch {
    errors.push('npm is not installed or not in PATH');
    return false;
  }

  return true;
}

/**
 * Check dependencies
 */
function checkDependencies() {
  const rootNodeModules = path.join(PROJECT_ROOT, 'node_modules');
  const streetsGlNodeModules = path.join(STREETS_GL_DIR, 'node_modules');

  if (!fs.existsSync(rootNodeModules)) {
    errors.push(`Missing dependencies in project root. Run: npm install`);
    return false;
  } else {
    console.log(`✅ Root dependencies installed`);
  }

  if (!fs.existsSync(streetsGlNodeModules)) {
    errors.push(`Missing dependencies in streets-gl-alt. Run: cd streets-gl-alt && npm install`);
    return false;
  } else {
    console.log(`✅ StreetsGL dependencies installed`);
  }

  return true;
}

/**
 * Check ports
 */
async function checkPorts() {
  console.log(`\n🔍 Checking port availability...`);
  
  for (const port of REQUIRED_PORTS) {
    const inUse = await isPortInUse(port);
    
    if (inUse) {
      const process = getProcessUsingPort(port);
      const processInfo = process 
        ? ` (PID: ${process.pid}, Process: ${process.name})`
        : '';
      
      const portName = port === 3000 ? 'Vite dev server' 
                     : port === 8081 ? 'StreetsGL server'
                     : 'Bug server';
      
      errors.push(`Port ${port} (${portName}) is already in use${processInfo}`);
    } else {
      const portName = port === 3000 ? 'Vite' 
                     : port === 8081 ? 'StreetsGL'
                     : 'Bug server';
      console.log(`✅ Port ${port} (${portName}) is available`);
    }
  }
}

/**
 * Main check function
 */
async function main() {
  console.log('🚀 Pre-flight Startup Check\n');
  console.log('='.repeat(50));
  
  // Check Node.js and npm
  console.log('\n📦 Checking Node.js and npm...');
  checkNodeAndNpm();
  
  // Check dependencies
  console.log('\n📚 Checking dependencies...');
  checkDependencies();
  
  // Check ports
  await checkPorts();
  
  // Report results
  console.log('\n' + '='.repeat(50));
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log(`   - ${w}`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    errors.forEach(e => console.log(`   - ${e}`));
    console.log('\n💡 Please fix the errors above before starting the dev server.');
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed! Ready to start dev servers.');
    console.log('\n💡 Starting servers now...');
    console.log('   (StreetsGL webpack compilation may take 30-60 seconds)\n');
    // Don't exit - let the next command in the chain run
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error during pre-flight check:', error);
  process.exit(1);
});

