# Clear Cursor Cache While Preserving Chat History
# This script clears cache but keeps chat history intact

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Clear Cache (Preserve Chat History)" -ForegroundColor Cyan
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

Write-Host "Cursor is closed. Proceeding with selective cache clearing..." -ForegroundColor Green
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"

# Only clear these folders (preserve chat history)
$cacheDirs = @(
    "Cache",
    "CachedData", 
    "Code Cache",
    "GPUCache"
    # NOTE: blob_storage and Local Storage are NOT deleted to preserve chat history
)

Write-Host "Will preserve chat history by NOT deleting:" -ForegroundColor Yellow
Write-Host "  - blob_storage (chat conversations)" -ForegroundColor Green
Write-Host "  - Local Storage (chat session data)" -ForegroundColor Green
Write-Host "  - Session Storage" -ForegroundColor Green
Write-Host "  - SharedStorage" -ForegroundColor Green
Write-Host ""

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
Write-Host "Chat history: PRESERVED ✓" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now you can:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. Your chat history should still be there" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")











































