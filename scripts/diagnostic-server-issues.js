#!/usr/bin/env node

/**
 * Complete Diagnostic Script for Server/Update Issues
 * 
 * Checks:
 * - Server status (ports 3000, 3001, 8081)
 * - Vite configuration
 * - File watching/HMR status
 * - Cache directories
 * - TypeScript compilation
 * - Browser cache recommendations
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('='.repeat(60));
console.log('COMPLETE SERVER DIAGNOSTIC');
console.log('='.repeat(60));
console.log();

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, { timeout: 2000 }, (res) => {
      resolve({ available: true, status: res.statusCode });
    });
    
    req.on('error', () => resolve({ available: false, error: 'Connection refused' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, error: 'Timeout' });
    });
  });
}

async function checkViteConfig() {
  log('\n📄 Checking Vite Configuration...', 'cyan');
  const viteConfigPath = path.join(rootDir, 'vite.config.ts');
  
  if (!fs.existsSync(viteConfigPath)) {
    log('❌ vite.config.ts not found', 'red');
    return;
  }
  
  const configContent = fs.readFileSync(viteConfigPath, 'utf-8');
  
  // Check for HMR
  if (configContent.includes('hmr: false')) {
    log('🔴 ISSUE: HMR is DISABLED (hmr: false)', 'red');
    log('   → Changes will NOT automatically reload', 'yellow');
  } else if (configContent.includes('hmr: true') || configContent.includes('hmr: {')) {
    log('✅ HMR is ENABLED', 'green');
    if (configContent.includes('hmr: {')) {
      log('   → HMR configured with options', 'green');
    }
  } else {
    log('⚠️  HMR setting not explicitly set (defaults to true)', 'yellow');
  }
  
  // Check for watch
  if (configContent.includes('watch: null')) {
    log('🔴 ISSUE: File watching is DISABLED (watch: null)', 'red');
    log('   → File changes will NOT be detected', 'yellow');
  } else if (configContent.includes('watch:')) {
    log('✅ File watching is configured', 'green');
  } else {
    log('⚠️  File watching not explicitly set (defaults to enabled)', 'yellow');
  }
  
  // Check for cache headers
  if (configContent.includes('Cache-Control') || configContent.includes('cache-control')) {
    log('✅ Cache-control headers configured', 'green');
  } else {
    log('⚠️  No cache-control headers found', 'yellow');
    log('   → Browser may cache old files', 'yellow');
  }
}

function checkCacheDirectories() {
  log('\n📁 Checking Cache Directories...', 'cyan');
  
  const viteCachePath = path.join(rootDir, 'node_modules', '.vite');
  if (fs.existsSync(viteCachePath)) {
    const stats = fs.statSync(viteCachePath);
    const size = getDirectorySize(viteCachePath);
    log(`⚠️  Vite cache exists: ${formatBytes(size)}`, 'yellow');
    log('   → Consider deleting node_modules/.vite/ if issues persist', 'yellow');
  } else {
    log('✅ No Vite cache directory found', 'green');
  }
  
  const distPath = path.join(rootDir, 'dist');
  if (fs.existsSync(distPath)) {
    log('⚠️  dist/ directory exists (production build)', 'yellow');
    log('   → Make sure you are using dev server, not preview', 'yellow');
  }
}

function getDirectorySize(dirPath) {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
        }
    }
  } catch (e) {
    // Ignore errors
  }
  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function checkServers() {
  log('\n🌐 Checking Server Status...', 'cyan');
  
  const ports = [
    { port: 3000, name: 'Vite Dev Server' },
    { port: 3001, name: 'Bug Server' },
    { port: 8081, name: 'StreetsGL Server' }
  ];
  
  for (const { port, name } of ports) {
    const result = await checkPort(port);
    if (result.available) {
      log(`✅ ${name} (port ${port}): Running (status: ${result.status})`, 'green');
    } else {
      log(`❌ ${name} (port ${port}): Not responding (${result.error})`, 'red');
    }
  }
}

function checkServiceWorker() {
  log('\n🔧 Checking Service Worker...', 'cyan');
  
  const swPath = path.join(rootDir, 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    log('⚠️  Service Worker found at public/sw.js', 'yellow');
    log('   → Service worker may cache responses', 'yellow');
    log('   → Unregister in browser: DevTools → Application → Service Workers', 'yellow');
  } else {
    log('✅ No service worker found', 'green');
  }
}

function checkTypeScript() {
  log('\n📝 Checking TypeScript Compilation...', 'cyan');
  
  try {
    const result = execSync('npx tsc --noEmit', { 
      cwd: rootDir, 
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000
    });
    log('✅ TypeScript compilation: No errors', 'green');
  } catch (error) {
    if (error.stdout) {
      const errorCount = (error.stdout.match(/error TS/g) || []).length;
      if (errorCount > 0) {
        log(`🔴 TypeScript compilation: ${errorCount} error(s) found`, 'red');
        log('   → Errors may prevent code from updating', 'yellow');
        log('   → First 500 chars of errors:', 'yellow');
        console.log(error.stdout.substring(0, 500));
      } else {
        log('✅ TypeScript compilation: No errors', 'green');
      }
    } else {
      log('⚠️  Could not check TypeScript compilation', 'yellow');
    }
  }
}

function generateRecommendations() {
  log('\n💡 Recommendations:', 'cyan');
  console.log();
  
  log('1. ENABLE HMR (if you want automatic updates):', 'yellow');
  console.log('   Edit vite.config.ts:');
  console.log('   - Change "hmr: false" to "hmr: true"');
  console.log('   - Change "watch: null" to "watch: {}"');
  console.log();
  
  log('2. CLEAR BROWSER CACHE:', 'yellow');
  console.log('   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)');
  console.log('   - Or: DevTools → Application → Clear storage → Clear site data');
  console.log();
  
  log('3. UNREGISTER SERVICE WORKERS:', 'yellow');
  console.log('   - DevTools → Application → Service Workers → Unregister');
  console.log();
  
  log('4. CLEAR VITE CACHE:', 'yellow');
  console.log('   - Delete: node_modules/.vite/');
  console.log('   - Restart dev server');
  console.log();
  
  log('5. MANUAL REFRESH (if keeping HMR disabled):', 'yellow');
  console.log('   - Make code changes');
  console.log('   - Save file');
  console.log('   - Manually refresh browser (F5)');
  console.log();
}

async function main() {
  await checkServers();
  await checkViteConfig();
  checkCacheDirectories();
  checkServiceWorker();
  checkTypeScript();
  generateRecommendations();
  
  log('\n' + '='.repeat(60), 'cyan');
  log('Diagnostic Complete', 'cyan');
  log('='.repeat(60), 'cyan');
  console.log();
}

main().catch(console.error);

