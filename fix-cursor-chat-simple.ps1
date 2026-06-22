# Cursor Chat Fix Script - Simplified Version
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cursor Chat Diagnostic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Cursor processes
Write-Host "Checking Cursor processes..." -ForegroundColor Yellow
$cursorProcesses = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcesses) {
    Write-Host "  Found $($cursorProcesses.Count) Cursor process(es)" -ForegroundColor Green
} else {
    Write-Host "  No Cursor processes found" -ForegroundColor Red
}

Write-Host ""

# Check network
Write-Host "Checking network connectivity..." -ForegroundColor Yellow
$test = Test-NetConnection -ComputerName api.cursor.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($test) {
    Write-Host "  Can reach api.cursor.com:443" -ForegroundColor Green
} else {
    Write-Host "  Cannot reach api.cursor.com:443" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FIX STEPS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. RELOAD CURSOR (Try this first!):" -ForegroundColor Yellow
Write-Host "   Press Ctrl+Shift+P, type: Developer: Reload Window" -ForegroundColor White
Write-Host ""
Write-Host "2. CLEAR CACHE (if reload doesn't work):" -ForegroundColor Yellow
Write-Host "   Close Cursor, delete Cache folders from:" -ForegroundColor White
Write-Host "   $env:APPDATA\Cursor" -ForegroundColor Gray
Write-Host ""
Write-Host "3. RESTART CURSOR (last resort):" -ForegroundColor Yellow
Write-Host "   Close all windows, wait 10 seconds, reopen" -ForegroundColor White
Write-Host ""






















































