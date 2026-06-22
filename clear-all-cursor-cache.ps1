# Complete Cursor Cache Clearing Script
# Run this AFTER closing Cursor completely

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Complete Cursor Cache Clear" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Cursor is running
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "ERROR: Cursor is still running!" -ForegroundColor Red
    Write-Host "Please close ALL Cursor windows first, then run this script." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit
}

Write-Host "Cursor is closed. Proceeding with cache clearing..." -ForegroundColor Green
Write-Host ""

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
            Write-Host "    ✓ Deleted" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "    ✗ Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  $dir : already cleared" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cache cleared: $deletedCount folder(s)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now you can:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. Chat should load properly" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")





















































