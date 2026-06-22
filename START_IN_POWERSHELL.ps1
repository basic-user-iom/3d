# PowerShell Script to Start Everything
# Right-click and "Run with PowerShell" or run: powershell -ExecutionPolicy Bypass -File START_IN_POWERSHELL.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  REVIT LIVE LINK - POWERSHELL START" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to project directory
Set-Location $PSScriptRoot

# Check Node.js
Write-Host "[1] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "    OK: Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "    ERROR: Node.js NOT found!" -ForegroundColor Red
    Write-Host "    Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check npm
Write-Host "[2] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "    OK: npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "    ERROR: npm NOT found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check dependencies
Write-Host "[3] Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "    OK: node_modules exists" -ForegroundColor Green
} else {
    Write-Host "    ERROR: node_modules NOT found!" -ForegroundColor Red
    Write-Host "    Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ERROR: Failed to install dependencies!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check Revit sync server dependencies
Write-Host "[4] Checking Revit sync server dependencies..." -ForegroundColor Yellow
if (Test-Path "server-revit-sync\node_modules") {
    Write-Host "    OK: server-revit-sync node_modules exists" -ForegroundColor Green
} else {
    Write-Host "    ERROR: server-revit-sync node_modules NOT found!" -ForegroundColor Red
    Write-Host "    Installing..." -ForegroundColor Yellow
    Set-Location "server-revit-sync"
    npm install
    Set-Location ..
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ERROR: Failed to install!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check ports
Write-Host "[5] Checking ports..." -ForegroundColor Yellow
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port3002 = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue
$port3003 = Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue

if ($port3000) {
    Write-Host "    WARNING: Port 3000 is in use!" -ForegroundColor Yellow
    Write-Host "    Killing process..." -ForegroundColor Yellow
    Stop-Process -Id $port3000.OwningProcess -Force -ErrorAction SilentlyContinue
}
if ($port3002) {
    Write-Host "    WARNING: Port 3002 is in use!" -ForegroundColor Yellow
    Stop-Process -Id $port3002.OwningProcess -Force -ErrorAction SilentlyContinue
}
if ($port3003) {
    Write-Host "    WARNING: Port 3003 is in use!" -ForegroundColor Yellow
    Stop-Process -Id $port3003.OwningProcess -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STARTING SERVICES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Revit Sync Server and 3D Viewer Web App..." -ForegroundColor Yellow
Write-Host "This window will stay open while services run." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop everything" -ForegroundColor Yellow
Write-Host ""

# Start services
npm run dev:revit-only

Write-Host ""
Write-Host "Services stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
