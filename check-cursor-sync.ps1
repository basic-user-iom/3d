# Check Cursor Cloud Sync Status
# This script checks if Cursor is syncing chats to the cloud

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Cloud Sync Checker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$cursorPath = "$env:APPDATA\Cursor"
$userPath = Join-Path $cursorPath "User"

Write-Host "Step 1: Checking Cursor Settings..." -ForegroundColor Yellow
Write-Host ""

# Check settings.json for sync settings
$settingsFile = Join-Path $userPath "settings.json"
if (Test-Path $settingsFile) {
    Write-Host "  ✓ Found settings.json" -ForegroundColor Green
    $settingsContent = Get-Content $settingsFile -Raw -ErrorAction SilentlyContinue
    
    # Check for sync-related settings
    $syncPatterns = @("sync", "cloud", "account", "telemetry", "privacy")
    $foundSync = $false
    
    foreach ($pattern in $syncPatterns) {
        if ($settingsContent -match $pattern) {
            Write-Host "    - Contains '$pattern' setting" -ForegroundColor Gray
            $foundSync = $true
        }
    }
    
    if (-not $foundSync) {
        Write-Host "    - No explicit sync settings found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ settings.json not found" -ForegroundColor Red
}

Write-Host ""

# Check globalStorage for account/sync data
Write-Host "Step 2: Checking for Account/Sync Data..." -ForegroundColor Yellow
Write-Host ""

$globalStorage = Join-Path $userPath "globalStorage"
if (Test-Path $globalStorage) {
    Write-Host "  ✓ Found globalStorage" -ForegroundColor Green
    
    # Look for account-related folders
    $accountDirs = Get-ChildItem $globalStorage -Directory -ErrorAction SilentlyContinue | 
        Where-Object { $_.Name -like "*account*" -or $_.Name -like "*sync*" -or $_.Name -like "*cursor*" -or $_.Name -like "*auth*" }
    
    if ($accountDirs) {
        Write-Host "    Found account/sync related folders:" -ForegroundColor Green
        foreach ($dir in $accountDirs) {
            $fileCount = (Get-ChildItem $dir.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
            Write-Host "      - $($dir.Name): $fileCount files" -ForegroundColor Gray
        }
    } else {
        Write-Host "    - No account/sync folders found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ globalStorage not found" -ForegroundColor Red
}

Write-Host ""

# Check for workspaceStorage (might contain sync info)
Write-Host "Step 3: Checking Workspace Storage..." -ForegroundColor Yellow
Write-Host ""

$workspaceStorage = Join-Path $userPath "workspaceStorage"
if (Test-Path $workspaceStorage) {
    $workspaceCount = (Get-ChildItem $workspaceStorage -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "  ✓ Found workspaceStorage: $workspaceCount workspace(s)" -ForegroundColor Green
} else {
    Write-Host "  ✗ workspaceStorage not found" -ForegroundColor Red
}

Write-Host ""

# Check for any cloud-related files
Write-Host "Step 4: Checking for Cloud Sync Indicators..." -ForegroundColor Yellow
Write-Host ""

$cloudIndicators = @(
    Join-Path $cursorPath "cloud-sync",
    Join-Path $userPath "cloudStorage",
    Join-Path $userPath "sync"
)

$foundCloud = $false
foreach ($indicator in $cloudIndicators) {
    if (Test-Path $indicator) {
        Write-Host "  ✓ Found: $($indicator.Replace($cursorPath, '...'))" -ForegroundColor Green
        $foundCloud = $true
    }
}

if (-not $foundCloud) {
    Write-Host "  - No explicit cloud sync folders found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "How to Check Cloud Sync in Cursor UI:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. OPEN CURSOR SETTINGS:" -ForegroundColor Yellow
Write-Host "   - Press Ctrl+, (or File > Preferences > Settings)" -ForegroundColor White
Write-Host ""
Write-Host "2. SEARCH FOR SYNC:" -ForegroundColor Yellow
Write-Host "   - In the search box, type: 'sync'" -ForegroundColor White
Write-Host "   - Look for settings like:" -ForegroundColor White
Write-Host "     * 'Settings Sync'" -ForegroundColor Gray
Write-Host "     * 'Chat History Sync'" -ForegroundColor Gray
Write-Host "     * 'Cloud Sync'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. CHECK YOUR ACCOUNT:" -ForegroundColor Yellow
Write-Host "   - Click on your account icon (bottom left)" -ForegroundColor White
Write-Host "   - Or go to: File > Preferences > Account" -ForegroundColor White
Write-Host "   - Verify you're signed in" -ForegroundColor White
Write-Host ""
Write-Host "4. CHECK CHAT HISTORY:" -ForegroundColor Yellow
Write-Host "   - Open the Chat panel" -ForegroundColor White
Write-Host "   - Look for a 'Sync' or 'Cloud' icon" -ForegroundColor White
Write-Host "   - Check if there's a 'Restore from Cloud' option" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Important Notes:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠ Cursor may or may not sync chat history to cloud" -ForegroundColor Yellow
Write-Host "  - This depends on your Cursor plan/version" -ForegroundColor White
Write-Host "  - Free accounts may not have cloud sync" -ForegroundColor White
Write-Host "  - Check Cursor documentation for sync features" -ForegroundColor White
Write-Host ""
Write-Host "💡 If cloud sync is not available:" -ForegroundColor Yellow
Write-Host "  - Your chats are stored locally only" -ForegroundColor White
Write-Host "  - Once deleted, they cannot be recovered" -ForegroundColor White
Write-Host "  - Use backups in the future (see backup script)" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
























































