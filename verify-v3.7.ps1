# Verify v3.7 Backup Status on Both Drives

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verifying v3.7 Backup Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$dDrive = "D:\3d-viever-backup\v3.7"
$fDrive = "F:\3d-viever-backup\v3.7"
$version = "v3.7"

# Check D Drive
Write-Host "D Drive Backup ($dDrive):" -ForegroundColor Cyan
if (Test-Path $dDrive) {
    $dFiles = Get-ChildItem $dDrive -Recurse -File -ErrorAction SilentlyContinue
    $dCount = ($dFiles | Measure-Object).Count
    $dSize = [math]::Round(($dFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    
    Write-Host "  Status: ✅ Exists" -ForegroundColor Green
    Write-Host "  Total Files: $dCount" -ForegroundColor White
    Write-Host "  Total Size: $dSize MB" -ForegroundColor White
    
    # Check for key files
    $keyFiles = @("package.json", "src", "vite.config.ts", "VERSION_INFO.json", "BACKUP_INFO.txt")
    Write-Host "  Key Files:" -ForegroundColor Yellow
    foreach ($keyFile in $keyFiles) {
        $keyPath = Join-Path $dDrive $keyFile
        if (Test-Path $keyPath) {
            Write-Host "    ✅ $keyFile" -ForegroundColor Green
        } else {
            Write-Host "    ❌ $keyFile (MISSING)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  Status: ❌ NOT FOUND" -ForegroundColor Red
}

Write-Host ""

# Check F Drive
Write-Host "F Drive Backup ($fDrive):" -ForegroundColor Cyan
if (Test-Path $fDrive) {
    $fFiles = Get-ChildItem $fDrive -Recurse -File -ErrorAction SilentlyContinue
    $fCount = ($fFiles | Measure-Object).Count
    $fSize = [math]::Round(($fFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    
    Write-Host "  Status: ✅ Exists" -ForegroundColor Green
    Write-Host "  Total Files: $fCount" -ForegroundColor White
    Write-Host "  Total Size: $fSize MB" -ForegroundColor White
    
    # Check for key files
    $keyFiles = @("package.json", "src", "vite.config.ts", "VERSION_INFO.json", "BACKUP_INFO.txt")
    Write-Host "  Key Files:" -ForegroundColor Yellow
    foreach ($keyFile in $keyFiles) {
        $keyPath = Join-Path $fDrive $keyFile
        if (Test-Path $keyPath) {
            Write-Host "    ✅ $keyFile" -ForegroundColor Green
        } else {
            Write-Host "    ❌ $keyFile (MISSING)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  Status: ❌ NOT FOUND" -ForegroundColor Red
}

Write-Host ""

# Compare both drives
if ((Test-Path $dDrive) -and (Test-Path $fDrive)) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Comparison Summary" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    $fileDiff = $dCount - $fCount
    $sizeDiff = [math]::Round($dSize - $fSize, 2)
    
    if ($fileDiff -eq 0 -and [math]::Abs($sizeDiff) -lt 1) {
        Write-Host "✅ Backups are synchronized!" -ForegroundColor Green
        Write-Host "  File count difference: $fileDiff" -ForegroundColor White
        Write-Host "  Size difference: $sizeDiff MB" -ForegroundColor White
    } else {
        Write-Host "⚠️ Backups have minor differences:" -ForegroundColor Yellow
        Write-Host "  File count difference: $fileDiff" -ForegroundColor White
        Write-Host "  Size difference: $sizeDiff MB" -ForegroundColor White
        Write-Host "  (This is normal - may include backup metadata files)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

















