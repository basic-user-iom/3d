# Cursor Chat Fix Script
# This script helps diagnose and fix Cursor chat loading issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Chat Diagnostic & Fix Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Cursor processes
Write-Host "Step 1: Checking Cursor processes..." -ForegroundColor Yellow
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "  ✓ Found $($cursorProcesses.Count) Cursor process(es)" -ForegroundColor Green
    $cursorProcesses | ForEach-Object {
        Write-Host "    - PID: $($_.Id), Memory: $([math]::Round($_.WorkingSet64/1MB,2)) MB" -ForegroundColor Gray
    }
} else {
    Write-Host "  ✗ No Cursor processes found" -ForegroundColor Red
}

Write-Host ""

# Step 2: Check network connectivity
Write-Host "Step 2: Checking network connectivity..." -ForegroundColor Yellow
$test = Test-NetConnection -ComputerName api.cursor.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($test) {
    Write-Host "  ✓ Can reach api.cursor.com:443" -ForegroundColor Green
} else {
    Write-Host "  ✗ Cannot reach api.cursor.com:443" -ForegroundColor Red
    Write-Host "    Check your internet connection and firewall settings" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Check Cursor config directory
Write-Host "Step 3: Checking Cursor configuration..." -ForegroundColor Yellow
$cursorPath = "$env:APPDATA\Cursor"
if (Test-Path $cursorPath) {
    Write-Host "  ✓ Cursor config directory exists: $cursorPath" -ForegroundColor Green
    
    # Check for cache directories
    $cacheDirs = @("Cache", "CachedData", "Code Cache", "GPUCache")
    foreach ($dir in $cacheDirs) {
        $fullPath = Join-Path $cursorPath $dir
        if (Test-Path $fullPath) {
            $size = (Get-ChildItem $fullPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $sizeMB = [math]::Round($size / 1MB, 2)
            Write-Host "    - $dir : $sizeMB MB" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  ✗ Cursor config directory not found" -ForegroundColor Red
}

Write-Host ""

# Step 4: Check for recent errors in logs
Write-Host "Step 4: Checking recent logs for errors..." -ForegroundColor Yellow
$logPath = "$env:APPDATA\Cursor\logs"
if (Test-Path $logPath) {
    $recentLogs = Get-ChildItem $logPath -Recurse -Filter "*.log" -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -gt (Get-Date).AddHours(-1)} | Sort-Object LastWriteTime -Descending
    if ($recentLogs) {
        Write-Host "  ✓ Found $($recentLogs.Count) recent log file(s)" -ForegroundColor Green
        $errorCount = 0
        foreach ($log in ($recentLogs | Select-Object -First 3)) {
            $errors = Get-Content $log.FullName -ErrorAction SilentlyContinue | Select-String -Pattern "error|Error|ERROR|failed|Failed|FAILED" | Select-Object -First 5
            if ($errors) {
                $errorCount += $errors.Count
                Write-Host "    - $($log.Name): $($errors.Count) error(s) found" -ForegroundColor Yellow
            }
        }
        if ($errorCount -eq 0) {
            Write-Host "    - No recent errors found in logs" -ForegroundColor Green
        }
    } else {
        Write-Host "  ⚠ No recent log files found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ Logs directory not found" -ForegroundColor Red
}

Write-Host ""

# Step 5: Recommendations
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Recommendations:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. RELOAD CURSOR WINDOW (Try this first!):" -ForegroundColor Yellow
Write-Host "   - Press Ctrl+Shift+P" -ForegroundColor White
Write-Host "   - Type: Developer: Reload Window" -ForegroundColor White
Write-Host "   - Press Enter" -ForegroundColor White
Write-Host ""
Write-Host "2. CLEAR CACHE (if reload doesn't work):" -ForegroundColor Yellow
Write-Host "   - Close Cursor completely" -ForegroundColor White
Write-Host "   - Delete these folders from: $cursorPath" -ForegroundColor White
Write-Host "     * Cache" -ForegroundColor Gray
Write-Host "     * CachedData" -ForegroundColor Gray
Write-Host "     * Code Cache" -ForegroundColor Gray
Write-Host "   - Restart Cursor" -ForegroundColor White
Write-Host ""
Write-Host "3. CHECK CURSOR OUTPUT:" -ForegroundColor Yellow
Write-Host "   - Press Ctrl+Shift+P" -ForegroundColor White
Write-Host "   - Type: Output: Show Output Channel" -ForegroundColor White
Write-Host "   - Select 'Log (Main)' or 'Cursor'" -ForegroundColor White
Write-Host "   - Look for chat-related errors" -ForegroundColor White
Write-Host ""
Write-Host "4. RESTART CURSOR (if all else fails):" -ForegroundColor Yellow
Write-Host "   - Close all Cursor windows" -ForegroundColor White
Write-Host "   - Wait 10 seconds" -ForegroundColor White
Write-Host "   - Reopen Cursor" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Script completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

