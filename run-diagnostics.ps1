# Comprehensive Diagnostic Script
# This will write all output to a file we can read

$outputFile = "diagnostic-results-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$results = @()

$results += "========================================"
$results += "COMPREHENSIVE DIAGNOSTIC TEST"
$results += "Date: $(Get-Date)"
$results += "========================================"
$results += ""

# Test 1: Node.js
$results += "TEST 1: Node.js"
try {
    $nodeVer = node --version 2>&1
    $results += "  ✅ PASS: Node.js found"
    $results += "  Version: $nodeVer"
} catch {
    $results += "  ❌ FAIL: Node.js not found"
    $results += "  Error: $($_.Exception.Message)"
}
$results += ""

# Test 2: npm
$results += "TEST 2: npm"
try {
    $npmVer = npm --version 2>&1
    $results += "  ✅ PASS: npm found"
    $results += "  Version: $npmVer"
} catch {
    $results += "  ❌ FAIL: npm not found"
    $results += "  Error: $($_.Exception.Message)"
}
$results += ""

# Test 3: Directory
$results += "TEST 3: Current Directory"
$results += "  Current: $(Get-Location)"
$results += "  Expected: D:\ai-cursor\3d-test-software"
if ((Get-Location).Path -eq "D:\ai-cursor\3d-test-software") {
    $results += "  ✅ PASS: In correct directory"
} else {
    $results += "  ⚠️  WARN: Not in expected directory"
}
$results += ""

# Test 4: Files
$results += "TEST 4: Essential Files"
$files = @("package.json", "vite.config.ts", "index.html", "src/main.tsx")
foreach ($file in $files) {
    $exists = Test-Path $file
    $results += "  $file : $(if ($exists) { '✅ EXISTS' } else { '❌ NOT FOUND' })"
}
$results += ""

# Test 5: Dependencies
$results += "TEST 5: Dependencies"
if (Test-Path "node_modules") {
    $results += "  ✅ PASS: node_modules exists"
    $viteExists = Test-Path "node_modules\.bin\vite.cmd"
    $concurrentlyExists = Test-Path "node_modules\.bin\concurrently.cmd"
    $results += "  vite.cmd: $(if ($viteExists) { '✅ EXISTS' } else { '❌ NOT FOUND' })"
    $results += "  concurrently.cmd: $(if ($concurrentlyExists) { '✅ EXISTS' } else { '❌ NOT FOUND' })"
} else {
    $results += "  ❌ FAIL: node_modules NOT FOUND"
    $results += "  Action required: Run 'npm install'"
}
$results += ""

# Test 6: Ports
$results += "TEST 6: Port Status"
$ports = @(3000, 3001, 4000, 5173, 8081)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        $results += "  Port $port : ⚠️  IN USE by $($proc.ProcessName) (PID: $($conn.OwningProcess))"
    } else {
        $results += "  Port $port : ✅ AVAILABLE"
    }
}
$results += ""

# Test 7: Processes
$results += "TEST 7: Running Processes"
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
$results += "  Node.js processes: $($nodeProcs.Count)"
if ($nodeProcs) {
    foreach ($proc in $nodeProcs) {
        $runtime = (Get-Date) - $proc.StartTime
        $results += "    - PID: $($proc.Id), Running for: $([math]::Round($runtime.TotalSeconds))s"
    }
}
$results += ""

# Test 8: Try Vite
$results += "TEST 8: Testing Vite"
try {
    $viteTest = npx vite --version 2>&1
    $results += "  ✅ PASS: Vite can run"
    $results += "  Output: $viteTest"
} catch {
    $results += "  ❌ FAIL: Vite cannot run"
    $results += "  Error: $($_.Exception.Message)"
}
$results += ""

# Test 9: Try npm run dev (quick test)
$results += "TEST 9: Testing npm run dev script"
try {
    $scriptContent = (Get-Content "package.json" | ConvertFrom-Json).scripts.dev
    $results += "  ✅ PASS: Script exists"
    $results += "  Script: $scriptContent"
} catch {
    $results += "  ❌ FAIL: Cannot read script"
    $results += "  Error: $($_.Exception.Message)"
}
$results += ""

# Write results
$results | Out-File -FilePath $outputFile -Encoding UTF8

# Also display
$results | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Results saved to: $outputFile" -ForegroundColor Green


















































