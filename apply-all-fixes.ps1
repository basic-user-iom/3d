# Apply All Fixes for Cursor Chat
# This script applies all remaining fixes

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Applying All Fixes" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Fix 1: Clear any remaining cache
Write-Host "Fix 1: Clearing remaining cache..." -ForegroundColor Yellow
$cursorPath = "$env:APPDATA\Cursor"
$cacheDirs = @("blob_storage", "Local Storage", "Session Storage", "SharedStorage")
$cleared = 0
foreach ($dir in $cacheDirs) {
    $fullPath = Join-Path $cursorPath $dir
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Recurse -Force -ErrorAction Stop
            Write-Host "  Cleared: $dir" -ForegroundColor Green
            $cleared++
        } catch {
            Write-Host "  Skipped: $dir (may be in use)" -ForegroundColor Yellow
        }
    }
}
if ($cleared -eq 0) {
    Write-Host "  All cache already cleared" -ForegroundColor Green
}

Write-Host ""

# Fix 2: Flush DNS
Write-Host "Fix 2: Flushing DNS cache..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "  DNS cache flushed" -ForegroundColor Green

Write-Host ""

# Fix 3: Verify user settings
Write-Host "Fix 3: Verifying Cursor user settings..." -ForegroundColor Yellow
$userSettingsPath = "$env:APPDATA\Cursor\User\settings.json"
if (Test-Path $userSettingsPath) {
    try {
        $content = Get-Content $userSettingsPath -Raw
        $settings = $content | ConvertFrom-Json -ErrorAction Stop
        
        $needsUpdate = $false
        if ($settings.'cursor.chat.enabled' -eq $false) {
            $settings.'cursor.chat.enabled' = $true
            $needsUpdate = $true
            Write-Host "  Enabled chat in user settings" -ForegroundColor Green
        }
        
        if ($needsUpdate) {
            $settings | ConvertTo-Json -Depth 10 | Set-Content $userSettingsPath
        } else {
            Write-Host "  Settings already correct" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Could not update settings (may be using defaults)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Settings file not found (using defaults - OK)" -ForegroundColor Gray
}

Write-Host ""

# Fix 4: Verify project settings
Write-Host "Fix 4: Verifying project settings..." -ForegroundColor Yellow
if (Test-Path ".vscode\settings.json") {
    Write-Host "  Project settings exist" -ForegroundColor Green
} else {
    Write-Host "  Creating project settings..." -ForegroundColor Yellow
    $projectSettings = @{
        "cursor.chat.enabled" = $true
        "cursor.chat.autoLoad" = $true
        "cursor.general.enableChat" = $true
    }
    if (-not (Test-Path ".vscode")) {
        New-Item -ItemType Directory -Path ".vscode" | Out-Null
    }
    $projectSettings | ConvertTo-Json | Set-Content ".vscode\settings.json"
    Write-Host "  Project settings created" -ForegroundColor Green
}

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ALL FIXES APPLIED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: RELOAD CURSOR WINDOW" -ForegroundColor Yellow
Write-Host ""
Write-Host "In Cursor:" -ForegroundColor White
Write-Host "1. Press Ctrl+Shift+P" -ForegroundColor White
Write-Host "2. Type: Developer: Reload Window" -ForegroundColor White
Write-Host "3. Press Enter" -ForegroundColor White
Write-Host ""
Write-Host "After reload, chat should work!" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




















































