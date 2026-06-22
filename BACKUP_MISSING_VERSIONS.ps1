# Backup Missing Versions Script
# Backs up only the versions that are missing from F:\3d-viever-backup

$backupDir = "F:\3d-viever-backup"
$currentBranch = git branch --show-current
$currentCommit = git rev-parse HEAD

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backing Up Missing Versions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check what's already backed up
$backedUp = @()
if (Test-Path $backupDir) {
    $backedUp = (Get-ChildItem $backupDir -Directory).Name
}

# All versions that should exist
$allVersions = @('v1.0','v1.1','v1.2','v1.3','v1.4','v1.5','v1.6','v1.7','v1.8','v1.9','v2.0','v2.1','v2.2')
$missingVersions = $allVersions | Where-Object { $backedUp -notcontains $_ }

Write-Host "Already backed up: $($backedUp.Count) versions" -ForegroundColor Green
Write-Host "Missing: $($missingVersions.Count) versions" -ForegroundColor Yellow
Write-Host "Will backup: $($missingVersions -join ', ')" -ForegroundColor Cyan
Write-Host ""

if ($missingVersions.Count -eq 0) {
    Write-Host "✅ All versions are already backed up!" -ForegroundColor Green
    exit 0
}

# Backup each missing version
foreach ($tag in $missingVersions) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Backing up version: $tag" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    $versionBackupDir = Join-Path $backupDir $tag
    
    # Double-check it doesn't exist
    if (Test-Path $versionBackupDir) {
        Write-Host "Version $tag already exists. Skipping..." -ForegroundColor Yellow
        Write-Host ""
        continue
    }
    
    # Create temporary directory
    $tempDir = Join-Path $env:TEMP "git-backup-$tag"
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    try {
        # Create archive
        Write-Host "Creating archive..." -ForegroundColor Yellow
        $archivePath = Join-Path $env:TEMP "$tag.zip"
        git archive --format=zip --output=$archivePath $tag
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to create archive for $tag" -ForegroundColor Red
            continue
        }
        
        # Extract archive
        Write-Host "Extracting archive..." -ForegroundColor Yellow
        Expand-Archive -Path $archivePath -DestinationPath $tempDir -Force
        
        # Move to backup directory
        Write-Host "Moving to backup directory..." -ForegroundColor Yellow
        Move-Item -Path (Join-Path $tempDir "*") -Destination $versionBackupDir -Force
        
        # Save version info
        $tagInfo = @{
            tag = $tag
            commit = (git rev-parse $tag)
            date = (git log -1 --format=%ci $tag)
            backedUpDate = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        $tagInfo | ConvertTo-Json | Out-File (Join-Path $versionBackupDir "VERSION_INFO.json") -Encoding UTF8
        
        # Cleanup
        Remove-Item -Path $archivePath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        
        Write-Host "✅ Version $tag backed up successfully!" -ForegroundColor Green
        Write-Host "   Location: $versionBackupDir" -ForegroundColor Gray
        
    } catch {
        Write-Host "ERROR: Failed to backup $tag - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

# Return to original branch
Write-Host "Returning to current branch: $currentBranch" -ForegroundColor Yellow
git checkout $currentBranch 2>&1 | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Final status
if (Test-Path $backupDir) {
    $finalBackedUp = (Get-ChildItem $backupDir -Directory).Name
    Write-Host "Total versions backed up: $($finalBackedUp.Count) / $($allVersions.Count)" -ForegroundColor $(if ($finalBackedUp.Count -eq $allVersions.Count) { "Green" } else { "Yellow" })
    
    if ($finalBackedUp.Count -eq $allVersions.Count) {
        Write-Host "✅ All 13 versions are now backed up!" -ForegroundColor Green
    } else {
        $stillMissing = $allVersions | Where-Object { $finalBackedUp -notcontains $_ }
        Write-Host "Still missing: $($stillMissing -join ', ')" -ForegroundColor Red
    }
}

Write-Host ""



















































