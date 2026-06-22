# Check Cursor Chat History Location
# This script checks where your chats are stored and if they still exist

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Chat History Checker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
Write-Host "Cursor Data Location: $cursorPath" -ForegroundColor Yellow
Write-Host ""

# Check chat storage locations
Write-Host "Checking Chat Storage Locations:" -ForegroundColor Yellow
Write-Host ""

# 1. blob_storage (main chat data)
$blobStorage = Join-Path $cursorPath "blob_storage"
if (Test-Path $blobStorage) {
    $blobFiles = Get-ChildItem $blobStorage -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    $blobSize = (Get-ChildItem $blobStorage -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $blobSizeMB = [math]::Round($blobSize / 1MB, 2)
    Write-Host "  ✓ blob_storage: EXISTS" -ForegroundColor Green
    Write-Host "    - Files: $($blobFiles.Count)" -ForegroundColor Gray
    Write-Host "    - Size: $blobSizeMB MB" -ForegroundColor Gray
} else {
    Write-Host "  ✗ blob_storage: MISSING" -ForegroundColor Red
}

# 2. Local Storage (session data)
$localStorage = Join-Path $cursorPath "Local Storage"
if (Test-Path $localStorage) {
    $localFiles = Get-ChildItem $localStorage -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    $localSize = (Get-ChildItem $localStorage -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $localSizeMB = [math]::Round($localSize / 1MB, 2)
    Write-Host "  ✓ Local Storage: EXISTS" -ForegroundColor Green
    Write-Host "    - Files: $($localFiles.Count)" -ForegroundColor Gray
    Write-Host "    - Size: $localSizeMB MB" -ForegroundColor Gray
} else {
    Write-Host "  ✗ Local Storage: MISSING" -ForegroundColor Red
}

# 3. workspaceStorage (UI state)
$workspaceStorage = Join-Path $cursorPath "User\workspaceStorage"
if (Test-Path $workspaceStorage) {
    $workspaceDirs = Get-ChildItem $workspaceStorage -Directory -ErrorAction SilentlyContinue | Measure-Object
    Write-Host "  ✓ workspaceStorage: EXISTS" -ForegroundColor Green
    Write-Host "    - Workspaces: $($workspaceDirs.Count)" -ForegroundColor Gray
} else {
    Write-Host "  ✗ workspaceStorage: MISSING" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Analysis:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ((Test-Path $blobStorage) -and (Test-Path $localStorage)) {
    Write-Host "✓ Chat data storage exists!" -ForegroundColor Green
    Write-Host ""
    Write-Host "If chats are not showing in Cursor, try:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. RELOAD CURSOR WINDOW:" -ForegroundColor White
    Write-Host "   - Press Ctrl+Shift+P" -ForegroundColor Gray
    Write-Host "   - Type: Developer: Reload Window" -ForegroundColor Gray
    Write-Host "   - Press Enter" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. CHECK CURSOR SYNC:" -ForegroundColor White
    Write-Host "   - Make sure you're signed in to Cursor" -ForegroundColor Gray
    Write-Host "   - Check Settings > Sync for chat history sync" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. CLEAR WORKSPACE STATE (preserves chats):" -ForegroundColor White
    Write-Host "   - Close Cursor completely" -ForegroundColor Gray
    Write-Host "   - Run: .\clear-cache-preserve-chat.ps1" -ForegroundColor Gray
    Write-Host "   - This clears UI state but keeps chat data" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "✗ Chat storage is missing!" -ForegroundColor Red
    Write-Host ""
    Write-Host "This means:" -ForegroundColor Yellow
    Write-Host "  - Chat history was deleted (possibly by cache clearing)" -ForegroundColor White
    Write-Host "  - Chats cannot be recovered from local storage" -ForegroundColor White
    Write-Host ""
    Write-Host "However:" -ForegroundColor Yellow
    Write-Host "  - If you're signed in, check Cursor cloud sync" -ForegroundColor White
    Write-Host "  - New chats will be saved normally" -ForegroundColor White
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
























































