# Verify Chat Status Script
# Run this to check if chat is actually working

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Chat Status Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Network
Write-Host "1. Network Connectivity:" -ForegroundColor Yellow
$apiTest = Test-NetConnection -ComputerName api.cursor.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($apiTest) {
    Write-Host "   OK: Can reach Cursor API" -ForegroundColor Green
} else {
    Write-Host "   ERROR: Cannot reach Cursor API" -ForegroundColor Red
    Write-Host "   This will prevent chat from working!" -ForegroundColor Red
}

Write-Host ""

# Check 2: Cursor Running
Write-Host "2. Cursor Status:" -ForegroundColor Yellow
$cursorProcs = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcs) {
    Write-Host "   OK: Cursor is running ($($cursorProcs.Count) process(es))" -ForegroundColor Green
} else {
    Write-Host "   WARNING: Cursor is not running" -ForegroundColor Yellow
}

Write-Host ""

# Check 3: Recent Logs
Write-Host "3. Recent Activity:" -ForegroundColor Yellow
$logPath = "$env:APPDATA\Cursor\logs"
$recentLogs = Get-ChildItem $logPath -Recurse -Filter "*.log" -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -gt (Get-Date).AddMinutes(-10)} | Measure-Object
if ($recentLogs.Count -gt 0) {
    Write-Host "   OK: Recent activity detected ($($recentLogs.Count) log files)" -ForegroundColor Green
} else {
    Write-Host "   WARNING: No recent activity" -ForegroundColor Yellow
}

Write-Host ""

# Check 4: Chat Views in Logs
Write-Host "4. Chat System Status:" -ForegroundColor Yellow
$viewsLog = Get-ChildItem $logPath -Recurse -Filter "*views*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($viewsLog) {
    $chatViews = Get-Content $viewsLog.FullName -ErrorAction SilentlyContinue | Select-String -Pattern "aichat" | Select-Object -Last 1
    if ($chatViews) {
        Write-Host "   OK: Chat views found in logs" -ForegroundColor Green
        Write-Host "   Latest: $($chatViews.Line.Substring(0, [Math]::Min(80, $chatViews.Line.Length)))" -ForegroundColor Gray
    } else {
        Write-Host "   WARNING: No chat views found in recent logs" -ForegroundColor Yellow
    }
} else {
    Write-Host "   WARNING: Views log not found" -ForegroundColor Yellow
}

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($apiTest -and $cursorProcs) {
    Write-Host "Status: System appears healthy" -ForegroundColor Green
    Write-Host ""
    Write-Host "If chat still shows 'Loading':" -ForegroundColor Yellow
    Write-Host "  - Reload Cursor window (Ctrl+Shift+P -> Developer: Reload Window)" -ForegroundColor White
    Write-Host "  - Try typing in chat (it might work despite the 'Loading' message)" -ForegroundColor White
    Write-Host "  - Wait 10-15 seconds for connection to establish" -ForegroundColor White
} else {
    Write-Host "Status: Issues detected" -ForegroundColor Red
    if (-not $apiTest) {
        Write-Host "  - Cannot reach Cursor API (check internet/firewall)" -ForegroundColor Red
    }
    if (-not $cursorProcs) {
        Write-Host "  - Cursor is not running" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




