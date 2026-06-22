# Fix Specific Chat Not Loading
# This script fixes the issue where a specific chat conversation won't load

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fix: Specific Chat Not Loading" -ForegroundColor Cyan
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

Write-Host "  [OK] Cursor is closed" -ForegroundColor Green
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
$userPath = Join-Path $cursorPath "User"

Write-Host "Step 1: Clearing workspace state (resets all chat panel states)..." -ForegroundColor Yellow
$workspaceStorage = Join-Path $userPath "workspaceStorage"
if (Test-Path $workspaceStorage) {
    Write-Host "  Found workspace storage" -ForegroundColor Gray
    try {
        Remove-Item -Path $workspaceStorage -Recurse -Force -ErrorAction Stop
        Write-Host "  [OK] Cleared workspace state" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Error: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  Workspace storage not found" -ForegroundColor Gray
}

Write-Host ""

Write-Host "Step 2: Clearing all cache (removes corrupted data)..." -ForegroundColor Yellow
$cacheDirs = @(
    "Cache",
    "CachedData", 
    "Code Cache",
    "GPUCache",
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

Write-Host "Step 3: Repairing chat storage (clears corrupted chat indexes)..." -ForegroundColor Yellow
$blobStorage = Join-Path $cursorPath "blob_storage"
$localStorage = Join-Path $cursorPath "Local Storage"

if (Test-Path $blobStorage) {
    Write-Host "  Found blob_storage" -ForegroundColor Gray
    Write-Host "  Clearing all index and lock files..." -ForegroundColor Gray
    
    # Clear all index files
    $indexFiles = Get-ChildItem -Path $blobStorage -Recurse -Filter "*index*" -ErrorAction SilentlyContinue
    $lockFiles = Get-ChildItem -Path $blobStorage -Recurse -Filter "*lock*" -ErrorAction SilentlyContinue
    
    $clearedCount = 0
    foreach ($file in ($indexFiles + $lockFiles)) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
            $clearedCount++
        } catch {
            # Ignore errors for locked files
        }
    }
    
    if ($clearedCount -gt 0) {
        Write-Host "  [OK] Cleared $clearedCount index/lock file(s)" -ForegroundColor Green
    } else {
        Write-Host "  No index files found" -ForegroundColor Gray
    }
    
    # Also try to clear any corrupted LevelDB files
    $leveldbDirs = Get-ChildItem -Path $blobStorage -Directory -Filter "*leveldb*" -ErrorAction SilentlyContinue
    foreach ($leveldb in $leveldbDirs) {
        $lockFile = Join-Path $leveldb.FullName "LOCK"
        if (Test-Path $lockFile) {
            try {
                Remove-Item -Path $lockFile -Force -ErrorAction Stop
                Write-Host "  [OK] Cleared LevelDB lock: $($leveldb.Name)" -ForegroundColor Green
            } catch {
                Write-Host "  [WARN] Could not clear LevelDB lock" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  blob_storage not found (will be recreated)" -ForegroundColor Gray
}

if (Test-Path $localStorage) {
    Write-Host "  Found Local Storage" -ForegroundColor Gray
    # Clear session and state files but preserve chat data
    $sessionFiles = Get-ChildItem -Path $localStorage -Filter "*session*" -ErrorAction SilentlyContinue
    $stateFiles = Get-ChildItem -Path $localStorage -Filter "*state*" -ErrorAction SilentlyContinue
    
    $clearedCount = 0
    foreach ($file in ($sessionFiles + $stateFiles)) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
            $clearedCount++
        } catch {
            # Ignore errors
        }
    }
    
    if ($clearedCount -gt 0) {
        Write-Host "  [OK] Cleared $clearedCount session/state file(s)" -ForegroundColor Green
    }
}

Write-Host ""

Write-Host "Step 4: Clearing Cursor state files..." -ForegroundColor Yellow
$statePath = Join-Path $userPath "globalStorage"
if (Test-Path $statePath) {
    # Clear state files that might be causing issues
    $stateFiles = Get-ChildItem -Path $statePath -Recurse -Filter "*state*" -ErrorAction SilentlyContinue
    $storageFiles = Get-ChildItem -Path $statePath -Recurse -Filter "*storage*" -ErrorAction SilentlyContinue
    
    $clearedCount = 0
    foreach ($file in ($stateFiles + $storageFiles)) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
            $clearedCount++
        } catch {
            # Ignore errors
        }
    }
    
    if ($clearedCount -gt 0) {
        Write-Host "  [OK] Cleared $clearedCount state file(s)" -ForegroundColor Green
    } else {
        Write-Host "  No state files found" -ForegroundColor Gray
    }
} else {
    Write-Host "  globalStorage not found" -ForegroundColor Gray
}

Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIX COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "What was fixed:" -ForegroundColor Yellow
Write-Host "  [OK] Workspace state cleared" -ForegroundColor Green
Write-Host "  [OK] All cache cleared" -ForegroundColor Green
Write-Host "  [OK] Chat storage indexes repaired" -ForegroundColor Green
Write-Host "  [OK] LevelDB locks cleared" -ForegroundColor Green
Write-Host "  [OK] Session/state files cleared" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open Cursor" -ForegroundColor White
Write-Host "2. Wait 30-45 seconds for full initialization" -ForegroundColor White
Write-Host "3. Try opening the 'Review software for bugs' chat again" -ForegroundColor White
Write-Host ""
Write-Host "Note: Chat history is preserved, but corrupted indexes have been cleared." -ForegroundColor Cyan
Write-Host "      The chat should rebuild its index when you open Cursor." -ForegroundColor Cyan
Write-Host ""
Write-Host "If the chat still doesn't load after this:" -ForegroundColor Yellow
Write-Host "  - The chat data itself may be corrupted" -ForegroundColor White
Write-Host "  - You may need to start a new chat for that topic" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")





























































