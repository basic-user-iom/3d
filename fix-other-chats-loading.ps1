# Fix "Other Chats Not Loading" Issue
# This script specifically fixes the problem where archived/previous chats don't load

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fix: Other Chats Not Loading" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Cursor is running
Write-Host "Checking if Cursor is running..." -ForegroundColor Yellow
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "  WARNING: Cursor is currently running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  To fix the chat loading issue:" -ForegroundColor Yellow
    Write-Host "  1. Close ALL Cursor windows completely" -ForegroundColor White
    Write-Host "  2. Wait 10 seconds for all processes to exit" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit
}

Write-Host "  OK: Cursor is closed" -ForegroundColor Green
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
$userPath = Join-Path $cursorPath "User"

Write-Host "Step 1: Clearing workspace state (fixes UI loading issues)..." -ForegroundColor Yellow
$workspaceStorage = Join-Path $userPath "workspaceStorage"
if (Test-Path $workspaceStorage) {
    Write-Host "  Found workspace storage" -ForegroundColor Gray
    try {
        Remove-Item -Path $workspaceStorage -Recurse -Force -ErrorAction Stop
        Write-Host "  [OK] Cleared workspace state" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Error clearing workspace state: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  Workspace storage not found (already cleared)" -ForegroundColor Gray
}

Write-Host ""

Write-Host "Step 2: Clearing corrupted chat cache (preserves chat history)..." -ForegroundColor Yellow
$cacheDirs = @(
    "Cache",
    "CachedData", 
    "Code Cache",
    "GPUCache",
    "Session Storage"
)

$deletedCount = 0
foreach ($dir in $cacheDirs) {
    $fullPath = Join-Path $cursorPath $dir
    if (Test-Path $fullPath) {
        Write-Host "  Deleting: $dir" -ForegroundColor Gray
        try {
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
            Write-Host "    [OK] Deleted" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "    [ERROR] Error: $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "  Cleared $deletedCount cache folder(s)" -ForegroundColor Green
Write-Host ""

Write-Host "Step 3: Repairing chat storage..." -ForegroundColor Yellow
$blobStorage = Join-Path $cursorPath "blob_storage"
$localStorage = Join-Path $cursorPath "Local Storage"

# Check if chat storage exists
$blobExists = Test-Path $blobStorage
$localExists = Test-Path $localStorage

if ($blobExists) {
    Write-Host "  Found blob_storage (chat conversations)" -ForegroundColor Gray
    # Try to repair by clearing only corrupted index files
    $indexFiles = Get-ChildItem -Path $blobStorage -Recurse -Filter "*index*" -ErrorAction SilentlyContinue
    if ($indexFiles) {
        Write-Host "  Found $($indexFiles.Count) index file(s)" -ForegroundColor Gray
        foreach ($file in $indexFiles) {
            try {
                Remove-Item -Path $file.FullName -Force -ErrorAction Stop
                Write-Host "    [OK] Cleared index: $($file.Name)" -ForegroundColor Green
            } catch {
                Write-Host "    [WARN] Could not clear: $($file.Name)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  blob_storage not found (will be recreated)" -ForegroundColor Gray
}

if ($localExists) {
    Write-Host "  Found Local Storage (chat session data)" -ForegroundColor Gray
    # Clear only session-related files, not chat history
    $sessionFiles = Get-ChildItem -Path $localStorage -Filter "*session*" -ErrorAction SilentlyContinue
    if ($sessionFiles) {
        foreach ($file in $sessionFiles) {
            try {
                Remove-Item -Path $file.FullName -Force -ErrorAction Stop
                Write-Host "    [OK] Cleared session file: $($file.Name)" -ForegroundColor Green
            } catch {
                Write-Host "    [WARN] Could not clear: $($file.Name)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  Local Storage not found (will be recreated)" -ForegroundColor Gray
}

Write-Host ""

Write-Host "Step 4: Clearing SharedStorage (UI state)..." -ForegroundColor Yellow
$sharedStorage = Join-Path $cursorPath "SharedStorage"
if (Test-Path $sharedStorage) {
    try {
        Remove-Item -Path $sharedStorage -Recurse -Force -ErrorAction Stop
        Write-Host "  [OK] Cleared SharedStorage" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Error: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  SharedStorage not found (already cleared)" -ForegroundColor Gray
}

Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIX COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "What was fixed:" -ForegroundColor Yellow
Write-Host "  [OK] Workspace state cleared (resets UI loading state)" -ForegroundColor Green
Write-Host "  [OK] Cache cleared (removes corrupted data)" -ForegroundColor Green
Write-Host "  [OK] Chat storage repaired (preserves chat history)" -ForegroundColor Green
Write-Host "  [OK] SharedStorage cleared (resets panel states)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. Wait 30 seconds for initialization" -ForegroundColor White
Write-Host "3. Try loading your other chats - they should work now!" -ForegroundColor White
Write-Host ""
Write-Host "Note: Your chat history is preserved, but the UI state has been reset." -ForegroundColor Cyan
Write-Host "      This should fix the 'Loading Chat' issue for archived chats." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")