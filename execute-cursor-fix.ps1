# Execute Complete Cursor Fix
# This script will guide you through the fix process

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Chat Fix - Execution Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check current status
Write-Host "Step 1: Checking Cursor status..." -ForegroundColor Yellow
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "  WARNING: Cursor is currently running" -ForegroundColor Yellow
    Write-Host "  Found $($cursorProcesses.Count) process(es)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  To complete the fix, you need to:" -ForegroundColor Yellow
    Write-Host "  1. Close ALL Cursor windows" -ForegroundColor White
    Write-Host "  2. Wait 10 seconds" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "  OR run: clear-all-cursor-cache.ps1 (after closing Cursor)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit
}

Write-Host "  OK: Cursor is closed" -ForegroundColor Green
Write-Host ""

# Step 2: Clear all cache
Write-Host "Step 2: Clearing all cache folders..." -ForegroundColor Yellow
$cursorPath = "$env:APPDATA\Cursor"
$cacheDirs = @(
    "Cache",
    "CachedData", 
    "Code Cache",
    "GPUCache",
    "blob_storage",
    "Local Storage",
    "Session Storage",
    "SharedStorage"
)

$deletedCount = 0
foreach ($dir in $cacheDirs) {
    $fullPath = Join-Path $cursorPath $dir
    if (Test-Path $fullPath) {
        Write-Host "  Deleting: $dir" -ForegroundColor Gray
        try {
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
            Write-Host "    Deleted successfully" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "    Error: $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "  Cleared $deletedCount folder(s)" -ForegroundColor Green
Write-Host ""

# Step 3: Verify configuration
Write-Host "Step 3: Verifying project configuration..." -ForegroundColor Yellow
$configFiles = @(
    ".vscode\settings.json",
    ".vscode\launch.json",
    ".vscode\tasks.json",
    ".cursorrules"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "  OK: $file exists" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: $file missing" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 4: Final instructions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIX COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. Chat should load properly now" -ForegroundColor Green
Write-Host ""
Write-Host "If chat still does not load:" -ForegroundColor Yellow
Write-Host "- Check Cursor Output (Ctrl+Shift+P -> Output: Show Output Channel)" -ForegroundColor White
Write-Host "- Verify internet connection" -ForegroundColor White
Write-Host "- Check Cursor account status" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
