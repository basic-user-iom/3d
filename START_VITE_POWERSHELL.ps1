# PowerShell Script to Start Vite Only
# Right-click and "Run with PowerShell" or run: powershell -ExecutionPolicy Bypass -File START_VITE_POWERSHELL.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STARTING VITE SERVER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to project directory
Set-Location $PSScriptRoot

Write-Host "Starting Vite on http://localhost:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start Vite
npx vite --host --port 3000

Write-Host ""
Write-Host "Vite stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
