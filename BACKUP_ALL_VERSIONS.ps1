# Backup All Versions Script
# Creates backup copies of all git-tagged versions to F:\3d-viever-backup

$backupDir = "F:\3d-viever-backup"
$currentBranch = git branch --show-current
$currentCommit = git rev-parse HEAD

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backing Up All Versions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create backup directory if it doesn't exist
if (-not (Test-Path $backupDir)) {
    Write-Host "Creating backup directory: $backupDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

# Get all version tags (v1.0, v1.1, v2.0, etc.)
Write-Host "Finding all version tags..." -ForegroundColor Yellow
$allTags = git tag -l
$versionTags = $allTags | Where-Object { $_ -match '^v\d+\.\d+' } | Sort-Object {
    $version = $_ -replace '^v', ''
    $parts = $version -split '\.'
    [int]$parts[0] * 1000 + [int]$parts[1]
}

Write-Host "Found $($versionTags.Count) version tags: $($versionTags -join ', ')" -ForegroundColor Green
Write-Host ""

$backedUpCount = 0
$skippedCount = 0

# Backup each version
foreach ($tag in $versionTags) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Backing up version: $tag" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    $versionBackupDir = Join-Path $backupDir $tag
    
    # Check if this version is already backed up
    if (Test-Path $versionBackupDir) {
        Write-Host "Version $tag already backed up. Skipping..." -ForegroundColor Yellow
        Write-Host ""
        $skippedCount++
        continue
    }
    
    # Create temporary directory for extraction
    $tempDir = Join-Path $env:TEMP "git-backup-$tag"
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    try {
        # Use git archive to create a clean copy (without .git folder)
        Write-Host "Creating archive for $tag..." -ForegroundColor Yellow
        $archivePath = Join-Path $env:TEMP "$tag.zip"
        
        # Create zip archive
        git archive --format=zip --output=$archivePath $tag
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to create archive for $tag" -ForegroundColor Red
            continue
        }
        
        # Extract archive
        Write-Host "Extracting archive..." -ForegroundColor Yellow
        Expand-Archive -Path $archivePath -DestinationPath $tempDir -Force
        
        # Move extracted files to backup directory
        Write-Host "Moving to backup directory..." -ForegroundColor Yellow
        Move-Item -Path (Join-Path $tempDir "*") -Destination $versionBackupDir -Force
        
        # Save version info
        $tagInfo = @{
            tag = $tag
            commit = git rev-parse $tag
            date = (git log -1 --format=%ci $tag)
            message = (git tag -l --format='%(contents)' $tag)
            backedUpDate = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        $tagInfo | ConvertTo-Json | Out-File (Join-Path $versionBackupDir "VERSION_INFO.json") -Encoding UTF8
        
        # Cleanup
        Remove-Item -Path $archivePath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        
        Write-Host "✅ Version $tag backed up successfully!" -ForegroundColor Green
        Write-Host "   Location: $versionBackupDir" -ForegroundColor Gray
        $backedUpCount++
        
    } catch {
        Write-Host "ERROR: Failed to backup $tag - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  - Backed up: $backedUpCount versions" -ForegroundColor Green
Write-Host "  - Skipped (already exists): $skippedCount versions" -ForegroundColor Yellow
Write-Host ""
Write-Host "All versions backed up to: $backupDir" -ForegroundColor Green
Write-Host ""
Write-Host "Backed up versions:" -ForegroundColor Cyan
if (Test-Path $backupDir) {
    Get-ChildItem -Path $backupDir -Directory | Sort-Object Name | ForEach-Object {
        $infoFile = Join-Path $_.FullName "VERSION_INFO.json"
        if (Test-Path $infoFile) {
            $info = Get-Content $infoFile | ConvertFrom-Json
            Write-Host "  - $($_.Name) (backed up: $($info.backedUpDate))" -ForegroundColor Cyan
        } else {
            Write-Host "  - $($_.Name)" -ForegroundColor Cyan
        }
    }
}
Write-Host ""
