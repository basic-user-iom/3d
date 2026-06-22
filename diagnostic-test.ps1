# Comprehensive Diagnostic Test Script
$results = @()

$results += "========================================"
$results += "DIAGNOSTIC TEST RESULTS"
$results += "Date: $(Get-Date)"
$results += "========================================"
$results += ""

# Test 1: Node.js
$results += "TEST 1: Node.js Installation"
try {
    $nodeVersion = node --version 2>&1
    $results += "  ✅ Node.js found: $nodeVersion"
    $nodePath = (Get-Command node).Source
    $results += "  Location: $nodePath"
} catch {
    $results += "  ❌ Node.js NOT FOUND: $($_.Exception.Message)"
}
$results += ""

# Test 2: npm
$results += "TEST 2: npm Installation"
try {
    $npmVersion = npm --version 2>&1
    $results += "  ✅ npm found: $npmVersion"
    $npmPath = (Get-Command npm).Source
    $results += "  Location: $npmPath"
} catch {
    $results += "  ❌ npm NOT FOUND: $($_.Exception.Message)"
}
$results += ""

# Test 3: Current Directory
$results += "TEST 3: Working Directory"
$results += "  Current: $(Get-Location)"
$results += "  Expected: D:\ai-cursor\3d-test-software"
if ((Get-Location).Path -eq "D:\ai-cursor\3d-test-software") {
    $results += "  ✅ In correct directory"
} else {
    $results += "  ⚠️  Not in expected directory"
}
$results += ""

# Test 4: package.json
$results += "TEST 4: package.json"
if (Test-Path "package.json") {
    $results += "  ✅ package.json exists"
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    $results += "  Project: $($pkg.name)"
    $results += "  Version: $($pkg.version)"
} else {
    $results += "  ❌ package.json NOT FOUND"
}
$results += ""

# Test 5: Dependencies
$results += "TEST 5: Dependencies"
if (Test-Path "node_modules") {
    $results += "  ✅ node_modules exists"
    $moduleCount = (Get-ChildItem "node_modules" -Directory).Count
    $results += "  Module count: $moduleCount"
} else {
    $results += "  ❌ node_modules NOT FOUND - Run: npm install"
}
$results += ""

# Test 6: StreetsGL Dependencies
$results += "TEST 6: StreetsGL Dependencies"
if (Test-Path "streets-gl-alt\node_modules") {
    $results += "  ✅ streets-gl-alt/node_modules exists"
} else {
    $results += "  ❌ streets-gl-alt/node_modules NOT FOUND - Run: cd streets-gl-alt && npm install"
}
$results += ""

# Test 7: Port Availability
$results += "TEST 7: Port Availability"
$ports = @(3000, 3001, 8081)
foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        $results += "  ❌ Port $port is IN USE by: $($process.ProcessName) (PID: $($connection.OwningProcess))"
    } else {
        $results += "  ✅ Port $port is available"
    }
}
$results += ""

# Test 8: Running Node Processes
$results += "TEST 8: Running Node.js Processes"
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $results += "  Found $($nodeProcesses.Count) Node.js process(es):"
    foreach ($proc in $nodeProcesses) {
        $results += "    - PID: $($proc.Id), Started: $($proc.StartTime)"
    }
} else {
    $results += "  ✅ No Node.js processes running"
}
$results += ""

# Test 9: Vite Installation
$results += "TEST 9: Vite Installation"
if (Test-Path "node_modules\vite") {
    $results += "  ✅ Vite is installed"
    $viteVersion = (Get-Content "node_modules\vite\package.json" | ConvertFrom-Json).version
    $results += "  Version: $viteVersion"
} else {
    $results += "  ❌ Vite NOT INSTALLED - Run: npm install"
}
$results += ""

# Test 10: Concurrently Installation
$results += "TEST 10: Concurrently Installation"
if (Test-Path "node_modules\concurrently") {
    $results += "  ✅ concurrently is installed"
} else {
    $results += "  ❌ concurrently NOT INSTALLED - Run: npm install"
}
$results += ""

# Test 11: Try to run npm run dev (quick test)
$results += "TEST 11: npm run dev Script Test"
try {
    $scriptContent = (Get-Content "package.json" | ConvertFrom-Json).scripts.dev
    $results += "  Script found: $scriptContent"
    $results += "  ✅ Script exists in package.json"
} catch {
    $results += "  ❌ Error reading script: $($_.Exception.Message)"
}
$results += ""

# Write results to file
$results | Out-File -FilePath "diagnostic-results.txt" -Encoding UTF8

# Display results
$results | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Results saved to: diagnostic-results.txt"


















































