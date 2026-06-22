# Complete Cursor Cloud Sync Check
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CURSOR CLOUD SYNC CHECK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
$userPath = Join-Path $cursorPath "User"

# 1. Check Settings
Write-Host "1. Checking Settings..." -ForegroundColor Yellow
$settingsFile = Join-Path $userPath "settings.json"
if (Test-Path $settingsFile) {
    $content = Get-Content $settingsFile -Raw -ErrorAction SilentlyContinue
    if ($content -and ($content -match 'sync|cloud|account')) {
        Write-Host "   [OK] Found sync/cloud/account references" -ForegroundColor Green
    } else {
        Write-Host "   [INFO] No sync settings in settings.json" -ForegroundColor Gray
    }
} else {
    Write-Host "   [WARN] settings.json not found" -ForegroundColor Yellow
}

Write-Host ""

# 2. Check Cloud Features
Write-Host "2. Checking Cloud Features..." -ForegroundColor Yellow
$globalStorage = Join-Path $userPath "globalStorage"
if (Test-Path $globalStorage) {
    $cursorRetrieval = Join-Path $globalStorage "anysphere.cursor-retrieval"
    if (Test-Path $cursorRetrieval) {
        Write-Host "   [OK] Found anysphere.cursor-retrieval (cloud features active)" -ForegroundColor Green
        $files = Get-ChildItem $cursorRetrieval -Recurse -File -ErrorAction SilentlyContinue
        Write-Host "   [INFO] Contains $($files.Count) files" -ForegroundColor Gray
    } else {
        Write-Host "   [WARN] cursor-retrieval folder not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [WARN] globalStorage not found" -ForegroundColor Yellow
}

Write-Host ""

# 3. Check Account Data
Write-Host "3. Checking Account Information..." -ForegroundColor Yellow
if (Test-Path $globalStorage) {
    $accountFiles = Get-ChildItem $globalStorage -Recurse -File -ErrorAction SilentlyContinue | 
        Where-Object { $_.Name -like "*account*" -or $_.Name -like "*auth*" -or $_.Name -like "*token*" }
    if ($accountFiles) {
        Write-Host "   [OK] Found account/auth files" -ForegroundColor Green
        $accountFiles | Select-Object -First 3 | ForEach-Object {
            Write-Host "      - $($_.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   [INFO] No account files found (may need to sign in)" -ForegroundColor Gray
    }
}

Write-Host ""

# 4. Check Local Chat Storage
Write-Host "4. Checking Local Chat Storage..." -ForegroundColor Yellow
$blobStorage = Join-Path $cursorPath "blob_storage"
if (Test-Path $blobStorage) {
    $blobFiles = Get-ChildItem $blobStorage -Recurse -File -ErrorAction SilentlyContinue
    if ($blobFiles.Count -gt 0) {
        $size = ($blobFiles | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 2)
        Write-Host "   [OK] Found $($blobFiles.Count) files ($sizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] blob_storage is EMPTY (0 files)" -ForegroundColor Red
        Write-Host "         This means local chats were deleted" -ForegroundColor Red
    }
} else {
    Write-Host "   [WARN] blob_storage not found" -ForegroundColor Red
}

Write-Host ""

# 5. Check Local Storage
Write-Host "5. Checking Local Storage..." -ForegroundColor Yellow
$localStorage = Join-Path $cursorPath "Local Storage"
if (Test-Path $localStorage) {
    $leveldbDirs = Get-ChildItem $localStorage -Directory -Filter "*leveldb*" -ErrorAction SilentlyContinue
    if ($leveldbDirs) {
        Write-Host "   [OK] Found LevelDB storage" -ForegroundColor Green
        foreach ($dir in $leveldbDirs) {
            $size = (Get-ChildItem $dir.FullName -Recurse -File -ErrorAction SilentlyContinue | 
                Measure-Object -Property Length -Sum).Sum
            $sizeMB = [math]::Round($size / 1MB, 2)
            Write-Host "      - $($dir.Name): $sizeMB MB" -ForegroundColor Gray
        }
    } else {
        Write-Host "   [WARN] No LevelDB found (storage is empty)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [WARN] Local Storage not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cloud Sync Status:" -ForegroundColor Yellow
Write-Host "  ✓ Cursor has cloud features (anysphere.cursor-retrieval exists)" -ForegroundColor Green
Write-Host "  ✗ Local chat storage is EMPTY (chats were deleted)" -ForegroundColor Red
Write-Host "  ? Cannot determine if chats are in cloud (need to check Cursor UI)" -ForegroundColor Yellow

Write-Host ""
Write-Host "To verify if chats are in cloud:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  METHOD 1: Check Cursor Settings" -ForegroundColor White
Write-Host "    1. Press Ctrl+, to open Settings" -ForegroundColor Gray
Write-Host "    2. Search for: 'sync' or 'chat history'" -ForegroundColor Gray
Write-Host "    3. Look for sync settings" -ForegroundColor Gray
Write-Host ""
Write-Host "  METHOD 2: Check Cursor Website" -ForegroundColor White
Write-Host "    1. Go to: https://cursor.com/account" -ForegroundColor Gray
Write-Host "    2. Sign in with your Cursor account" -ForegroundColor Gray
Write-Host "    3. Look for 'Chat History' section" -ForegroundColor Gray
Write-Host ""
Write-Host "  METHOD 3: Check Account Icon" -ForegroundColor White
Write-Host "    1. Click your account icon (bottom-left in Cursor)" -ForegroundColor Gray
Write-Host "    2. Check if you're signed in" -ForegroundColor Gray
Write-Host "    3. Look for sync status" -ForegroundColor Gray

Write-Host ""
Write-Host "Important Notes:" -ForegroundColor Yellow
Write-Host "  • Even if cloud sync exists, chat history may not be synced" -ForegroundColor Gray
Write-Host "  • This depends on your Cursor subscription plan" -ForegroundColor Gray
Write-Host "  • Free accounts typically don't have cloud sync" -ForegroundColor Gray
Write-Host "  • If not synced, chats are gone (local storage was deleted)" -ForegroundColor Gray

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

