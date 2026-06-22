# Comprehensive Test and Start Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COMPREHENSIVE TEST AND START" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$errors = @()
$warnings = @()

# Test 1: Node.js
Write-Host "[TEST 1] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    Write-Host "  [PASS] Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    $errors += "Node.js not found"
    Write-Host "  [FAIL] Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from https://nodejs.org/" -ForegroundColor Red
}

# Test 2: npm
Write-Host "[TEST 2] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version 2>&1
    Write-Host "  [PASS] npm found: $npmVersion" -ForegroundColor Green
} catch {
    $errors += "npm not found"
    Write-Host "  [FAIL] npm not found!" -ForegroundColor Red
}

# Test 3: Directory
Write-Host "[TEST 3] Checking directory..." -ForegroundColor Yellow
$currentDir = Get-Location
Write-Host "  Current: $currentDir" -ForegroundColor Gray
if ($currentDir.Path -eq "D:\ai-cursor\3d-test-software") {
    Write-Host "  [PASS] In correct directory" -ForegroundColor Green
} else {
    $warnings += "Not in expected directory"
    Write-Host "  [WARN] Not in expected directory" -ForegroundColor Yellow
}

# Test 4: package.json
Write-Host "[TEST 4] Checking package.json..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    Write-Host "  [PASS] package.json exists" -ForegroundColor Green
} else {
    $errors += "package.json not found"
    Write-Host "  [FAIL] package.json NOT FOUND!" -ForegroundColor Red
}

# Test 5: node_modules
Write-Host "[TEST 5] Checking node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    $moduleCount = (Get-ChildItem "node_modules" -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "  [PASS] node_modules exists ($moduleCount packages)" -ForegroundColor Green
} else {
    $errors += "node_modules not found"
    Write-Host "  [FAIL] node_modules NOT FOUND!" -ForegroundColor Red
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] npm install failed!" -ForegroundColor Red
    }
}

# Test 6: StreetsGL dependencies
Write-Host "[TEST 6] Checking StreetsGL dependencies..." -ForegroundColor Yellow
if (Test-Path "streets-gl-alt\node_modules") {
    Write-Host "  [PASS] StreetsGL node_modules exists" -ForegroundColor Green
} else {
    $warnings += "StreetsGL dependencies missing"
    Write-Host "  [WARN] StreetsGL node_modules NOT FOUND" -ForegroundColor Yellow
}

# Test 7: Ports
Write-Host "[TEST 7] Checking ports..." -ForegroundColor Yellow
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    $warnings += "Port 3000 in use"
    Write-Host "  [WARN] Port 3000 is in use" -ForegroundColor Yellow
    $port3000 | Format-Table LocalPort, State, OwningProcess
} else {
    Write-Host "  [PASS] Port 3000 is available" -ForegroundColor Green
}

$port8081 = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($port8081) {
    $warnings += "Port 8081 in use"
    Write-Host "  [WARN] Port 8081 is in use" -ForegroundColor Yellow
} else {
    Write-Host "  [PASS] Port 8081 is available" -ForegroundColor Green
}

# Test 8: Vite
Write-Host "[TEST 8] Checking Vite..." -ForegroundColor Yellow
if (Test-Path "node_modules\.bin\vite.cmd") {
    Write-Host "  [PASS] Vite is installed" -ForegroundColor Green
} else {
    $errors += "Vite not found"
    Write-Host "  [FAIL] Vite NOT FOUND!" -ForegroundColor Red
}

# Test 9: Concurrently
Write-Host "[TEST 9] Checking concurrently..." -ForegroundColor Yellow
if (Test-Path "node_modules\.bin\concurrently.cmd") {
    Write-Host "  [PASS] concurrently is installed" -ForegroundColor Green
} else {
    $warnings += "concurrently not found"
    Write-Host "  [WARN] concurrently NOT FOUND" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($errors.Count -gt 0) {
    Write-Host "  ERRORS FOUND: $($errors.Count)" -ForegroundColor Red
    foreach ($errItem in $errors) {
        Write-Host "    - $errItem" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Please fix errors before starting server!" -ForegroundColor Red
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host "  WARNINGS: $($warnings.Count)" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "    - $warning" -ForegroundColor Yellow
    }
}

Write-Host "  All critical tests passed!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STARTING SERVER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will start:" -ForegroundColor White
Write-Host "  - StreetsGL server (port 8081)" -ForegroundColor White
Write-Host "  - Vite dev server (port 3000)" -ForegroundColor White
Write-Host ""
Write-Host "Please wait 30-60 seconds for webpack compilation..." -ForegroundColor Yellow
Write-Host "Look for:" -ForegroundColor Yellow
Write-Host "  [StreetsGL] webpack compiled successfully" -ForegroundColor Cyan
Write-Host "  [3DViewer] Local: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the servers" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start the server
npm run dev












