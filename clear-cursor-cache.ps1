# Clear Cursor Cache Script
# This will clear Cursor's cache to fix chat loading issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Clearing Cursor Cache" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
$cacheDirs = @("Cache", "CachedData", "Code Cache", "GPUCache")

Write-Host "WARNING: Cursor must be closed for this to work!" -ForegroundColor Yellow
Write-Host ""

# Check if Cursor is running
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "⚠ Cursor is still running!" -ForegroundColor Red
    Write-Host "Please close Cursor first, then run this script again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit
}

Write-Host "Clearing cache directories..." -ForegroundColor Yellow
Write-Host ""

$deletedCount = 0
foreach ($dir in $cacheDirs) {
    $fullPath = Join-Path $cursorPath $dir
    if (Test-Path $fullPath) {
        Write-Host "  Deleting: $dir" -ForegroundColor Gray
        try {
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
            Write-Host "    ✓ Deleted successfully" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "    ✗ Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  $dir not found (already cleared)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cache cleared: $deletedCount folder(s) deleted" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. The chat should now load properly" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")






















































