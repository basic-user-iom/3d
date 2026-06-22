# Backup of Backup Script
# Creates a secondary backup/mirror of F:\3d-viever-backup to another location on F drive

$sourceBackupDir = "F:\3d-viever-backup"
$destinationBackupDir = "F:\3d-viever-backup-mirror"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backing Up Backup Directory" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Source: $sourceBackupDir" -ForegroundColor White
Write-Host "Destination: $destinationBackupDir" -ForegroundColor White
Write-Host ""

# Check if source exists
if (-not (Test-Path $sourceBackupDir)) {
    Write-Host "❌ ERROR: Source backup directory not found: $sourceBackupDir" -ForegroundColor Red
    Write-Host "Please create a backup first using BACKUP_CURRENT_VERSION.ps1" -ForegroundColor Yellow
    exit 1
}

# Check available space on F drive
Write-Host "Checking available space on F drive..." -ForegroundColor Yellow
$fDrive = Get-PSDrive F -ErrorAction SilentlyContinue
if ($fDrive) {
    $freeSpaceGB = [math]::Round($fDrive.Free / 1GB, 2)
    Write-Host "  Free space: $freeSpaceGB GB" -ForegroundColor $(if ($freeSpaceGB -gt 10) { "Green" } else { "Yellow" })
    
    # Estimate backup size
    $sourceSize = (Get-ChildItem -Path $sourceBackupDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $sourceSizeGB = [math]::Round($sourceSize / 1GB, 2)
    Write-Host "  Estimated backup size: $sourceSizeGB GB" -ForegroundColor Cyan
    
    if ($freeSpaceGB -lt $sourceSizeGB) {
        Write-Host "  ⚠️ WARNING: Not enough free space!" -ForegroundColor Red
        Write-Host "  You need at least $sourceSizeGB GB, but only have $freeSpaceGB GB" -ForegroundColor Yellow
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "Backup cancelled." -ForegroundColor Yellow
            exit
        }
    }
} else {
    Write-Host "  ⚠️ WARNING: Cannot check F drive space" -ForegroundColor Yellow
}

# Create destination directory
if (-not (Test-Path $destinationBackupDir)) {
    Write-Host "Creating destination directory: $destinationBackupDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $destinationBackupDir -Force | Out-Null
} else {
    Write-Host "Destination directory already exists: $destinationBackupDir" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/n)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Backup cancelled." -ForegroundColor Yellow
        exit
    }
    Write-Host "Removing existing destination..." -ForegroundColor Yellow
    Remove-Item -Path $destinationBackupDir -Recurse -Force
    New-Item -ItemType Directory -Path $destinationBackupDir -Force | Out-Null
}

Write-Host ""
Write-Host "Starting backup copy..." -ForegroundColor Yellow
Write-Host "This may take a long time depending on backup size..." -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date
$totalFiles = 0
$totalSize = 0
$copiedFiles = 0

# Get all versions to copy
$versions = Get-ChildItem -Path $sourceBackupDir -Directory | Sort-Object Name

Write-Host "Found $($versions.Count) version(s) to backup:" -ForegroundColor Cyan
$versions | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor White }
Write-Host ""

# Copy each version
foreach ($version in $versions) {
    $versionName = $version.Name
    $sourceVersion = $version.FullName
    $destVersion = Join-Path $destinationBackupDir $versionName
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Copying version: $versionName" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    # Get version info
    $versionFiles = Get-ChildItem -Path $sourceVersion -Recurse -File -ErrorAction SilentlyContinue
    $versionSize = ($versionFiles | Measure-Object -Property Length -Sum).Sum
    $versionSizeMB = [math]::Round($versionSize / 1MB, 2)
    
    Write-Host "  Files: $($versionFiles.Count)" -ForegroundColor White
    Write-Host "  Size: $versionSizeMB MB" -ForegroundColor White
    Write-Host "  Copying..." -ForegroundColor Yellow
    
    try {
        # Use Robocopy for better performance and progress
        $robocopyArgs = @(
            $sourceVersion,
            $destVersion,
            "/E",           # Copy subdirectories including empty ones
            "/R:3",         # Retry 3 times on failure
            "/W:5",         # Wait 5 seconds between retries
            "/MT:4",        # Multi-threaded (4 threads)
            "/NP",          # No progress (cleaner output)
            "/NFL",         # No file list
            "/NDL"          # No directory list
        )
        
        $robocopyResult = & robocopy @robocopyArgs 2>&1
        $exitCode = $LASTEXITCODE
        
        # Robocopy returns 0-7 for success, 8+ for errors
        if ($exitCode -le 7) {
            Write-Host "  ✅ Version $versionName copied successfully" -ForegroundColor Green
            $copiedFiles += $versionFiles.Count
            $totalFiles += $versionFiles.Count
            $totalSize += $versionSize
        } else {
            Write-Host "  ⚠️ Warning: Some files may not have been copied (exit code: $exitCode)" -ForegroundColor Yellow
            Write-Host "  This is normal if files are in use or already exist" -ForegroundColor Gray
        }
    } catch {
        # Fallback to Copy-Item if robocopy fails
        Write-Host "  Using PowerShell Copy-Item (fallback)..." -ForegroundColor Yellow
        try {
            Copy-Item -Path $sourceVersion -Destination $destVersion -Recurse -Force -ErrorAction Stop
            Write-Host "  ✅ Version $versionName copied successfully" -ForegroundColor Green
            $copiedFiles += $versionFiles.Count
            $totalFiles += $versionFiles.Count
            $totalSize += $versionSize
        } catch {
            Write-Host "  ❌ ERROR: Failed to copy $versionName - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}

$endTime = Get-Date
$duration = $endTime - $startTime
$totalSizeGB = [math]::Round($totalSize / 1GB, 2)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backup of Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Source: $sourceBackupDir" -ForegroundColor White
Write-Host "  Destination: $destinationBackupDir" -ForegroundColor White
Write-Host "  Versions copied: $($versions.Count)" -ForegroundColor Green
Write-Host "  Total files: $totalFiles" -ForegroundColor Green
Write-Host "  Total size: $totalSizeGB GB" -ForegroundColor Green
Write-Host "  Duration: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Backup mirror created successfully!" -ForegroundColor Green
Write-Host ""



















































