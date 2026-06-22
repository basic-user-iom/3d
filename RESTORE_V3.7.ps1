# Restore Backup v3.7
# Restores from D drive backup (or F drive if D doesn't exist)

$localBackupDir = "D:\3d-viever-backup"
$externalBackupDir = "F:\3d-viever-backup"
$targetDir = "D:\ai-cursor\3d-test-software"
$version = "v3.7"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restoring Backup v3.7" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Determine which backup to use (prefer D drive, fallback to F drive)
$backupPath = $null
if (Test-Path (Join-Path $localBackupDir $version)) {
    $backupPath = Join-Path $localBackupDir $version
    Write-Host "Using backup from: D Drive" -ForegroundColor Green
} elseif (Test-Path (Join-Path $externalBackupDir $version)) {
    $backupPath = Join-Path $externalBackupDir $version
    Write-Host "Using backup from: F Drive" -ForegroundColor Green
} else {
    Write-Host "ERROR: Backup v3.7 not found on D or F drive!" -ForegroundColor Red
    Write-Host "  Checked: $localBackupDir\$version" -ForegroundColor Yellow
    Write-Host "  Checked: $externalBackupDir\$version" -ForegroundColor Yellow
    exit 1
}

Write-Host "Backup location: $backupPath" -ForegroundColor White
Write-Host "Target location: $targetDir" -ForegroundColor White
Write-Host ""

# Confirm before proceeding
Write-Host "WARNING: This will overwrite files in the current project!" -ForegroundColor Red
Write-Host "Press Ctrl+C to cancel, or" -ForegroundColor Yellow
$confirm = Read-Host "Press Enter to continue with restore"

Write-Host ""
Write-Host "Starting restore..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

# Get list of directories/files to restore
$itemsToRestore = Get-ChildItem -Path $backupPath -Directory | Where-Object { 
    $_.Name -notin @("node_modules", ".git", "dist", "build", ".next", ".cache")
}

$totalFiles = 0
$totalSize = 0

# Restore each directory
foreach ($item in $itemsToRestore) {
    $sourcePath = $item.FullName
    $destPath = Join-Path $targetDir $item.Name
    
    Write-Host "Restoring $($item.Name)..." -ForegroundColor Cyan
    
    if (Test-Path $destPath) {
        Write-Host "  Removing existing: $($item.Name)" -ForegroundColor Yellow
        Remove-Item -Path $destPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    try {
        Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force -ErrorAction Stop
        $files = Get-ChildItem -Path $sourcePath -Recurse -File -ErrorAction SilentlyContinue
        $fileCount = $files.Count
        $fileSize = ($files | Measure-Object -Property Length -Sum).Sum
        $totalFiles += $fileCount
        $totalSize += $fileSize
        $sizeMB = [math]::Round($fileSize / 1MB, 2)
        Write-Host "  [OK] Restored $fileCount files ($sizeMB MB)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Error restoring $($item.Name): $_" -ForegroundColor Red
    }
}

# Restore root files
Write-Host ""
Write-Host "Restoring root files..." -ForegroundColor Cyan
$rootFiles = Get-ChildItem -Path $backupPath -File | Where-Object {
    $_.Extension -in @(".json", ".ts", ".js", ".md", ".html", ".css", ".txt", ".config", ".bat", ".ps1")
}

foreach ($file in $rootFiles) {
    $sourcePath = $file.FullName
    $destPath = Join-Path $targetDir $file.Name
    
    try {
        Copy-Item -Path $sourcePath -Destination $destPath -Force -ErrorAction Stop
        $totalFiles++
        $totalSize += $file.Length
        Write-Host "  [OK] Restored: $($file.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Error restoring $($file.Name): $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restore Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total files restored: $totalFiles" -ForegroundColor White
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
Write-Host "Total size: $totalSizeMB MB" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run 'npm install' to restore node_modules" -ForegroundColor White
Write-Host "  2. Check git status to see what changed" -ForegroundColor White
Write-Host "  3. Test the application" -ForegroundColor White
Write-Host ""
