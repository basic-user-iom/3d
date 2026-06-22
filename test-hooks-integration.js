/**
 * Integration Test Script for Hooks
 * Run with: node test-hooks-integration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Starting Hook Integration Test...\n');

// Test 1: Check all hook files exist
console.log('Test 1: Verifying hook files exist...');
const hookFiles = [
  'useThreeScene.ts',
  'useThreeControls.ts',
  'useThreeLighting.ts',
  'useThreeShadows.ts',
  'useThreeEffects.ts',
  'useThreeModelLoader.ts',
  'useThreeObjectManager.ts',
  'useThreeAnimation.ts'
];

const hooksDir = path.join(__dirname, 'src', 'viewer', 'hooks');
let allHooksExist = true;

hookFiles.forEach(file => {
  const filePath = path.join(hooksDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allHooksExist = false;
  }
});

console.log(allHooksExist ? '\n✅ All hook files exist\n' : '\n❌ Some hook files are missing\n');

// Test 2: Check hooks use useState
console.log('Test 2: Verifying hooks use useState...');
let allUseState = true;

hookFiles.forEach(file => {
  const filePath = path.join(hooksDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const hookName = file.replace('.ts', '');
    const resultName = hookName.replace('useThree', '').toLowerCase() + 'Result';
    
    // Check for useState
    if (content.includes('useState') && content.includes(resultName)) {
      console.log(`  ✅ ${hookName} uses useState`);
    } else {
      console.log(`  ❌ ${hookName} - useState pattern not found`);
      allUseState = false;
    }
  }
});

console.log(allUseState ? '\n✅ All hooks use useState\n' : '\n❌ Some hooks don\'t use useState\n');

// Test 3: Check ViewerCanvas.tsx for hook imports
console.log('Test 3: Checking ViewerCanvas.tsx for hook imports...');
const viewerCanvasPath = path.join(__dirname, 'src', 'viewer', 'ViewerCanvas.tsx');

if (fs.existsSync(viewerCanvasPath)) {
  const content = fs.readFileSync(viewerCanvasPath, 'utf8');
  let allImportsFound = true;
  
  hookFiles.forEach(file => {
    const hookName = file.replace('.ts', '');
    const importPattern = `from './hooks/${hookName}'`;
    
    if (content.includes(importPattern) || content.includes(`from "./hooks/${hookName}"`)) {
      console.log(`  ✅ ${hookName} imported`);
    } else {
      console.log(`  ⚠️  ${hookName} - import not found`);
      allImportsFound = false;
    }
  });
  
  // Check for hook calls
  console.log('\nTest 4: Checking ViewerCanvas.tsx for hook calls...');
  let allCallsFound = true;
  
  hookFiles.forEach(file => {
    const hookName = file.replace('.ts', '');
    const callPattern = `${hookName}(`;
    
    if (content.includes(callPattern)) {
      console.log(`  ✅ ${hookName} called`);
    } else {
      console.log(`  ⚠️  ${hookName} - call not found`);
      allCallsFound = false;
    }
  });
  
  // Check for ViewerInstance building
  console.log('\nTest 5: Checking ViewerInstance building...');
  const hasHookBasedViewer = content.includes('hookBasedViewer');
  const hasUseMemo = content.includes('useMemo');
  const hasAnimationResult = content.includes('animationResult');
  
  console.log(`  ${hasHookBasedViewer ? '✅' : '⚠️ '} hookBasedViewer found`);
  console.log(`  ${hasUseMemo ? '✅' : '⚠️ '} useMemo found`);
  console.log(`  ${hasAnimationResult ? '✅' : '⚠️ '} animationResult found`);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Integration Test Summary:');
  console.log('='.repeat(50));
  console.log(`Hook Files: ${allHooksExist ? '✅' : '❌'}`);
  console.log(`useState Pattern: ${allUseState ? '✅' : '❌'}`);
  console.log(`Hook Imports: ${allImportsFound ? '✅' : '⚠️ '}`);
  console.log(`Hook Calls: ${allCallsFound ? '✅' : '⚠️ '}`);
  console.log(`ViewerInstance Building: ${hasHookBasedViewer && hasUseMemo ? '✅' : '⚠️ '}`);
  console.log('='.repeat(50));
  
} else {
  console.log('  ❌ ViewerCanvas.tsx not found');
}

console.log('\n✅ Integration test complete!');

