# Backup Current Version as v3.3
# Creates backup on both D and F drives

$localBackupDir = "D:\3d-viever-backup"
$externalBackupDir = "F:\3d-viever-backup"
$sourceDir = "D:\ai-cursor\3d-test-software"
$nextVersion = "v3.3"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backing Up Current Version as v3.3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Creating backup for: $nextVersion" -ForegroundColor Green
Write-Host "Backup Process:" -ForegroundColor Cyan
Write-Host "  Step 1: Backup to D:\3d-viever-backup (local)" -ForegroundColor White
Write-Host "  Step 2: Copy to F:\3d-viever-backup (external)" -ForegroundColor White
Write-Host ""

# ========================================
# STEP 1: Create backup on D drive first
# ========================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STEP 1: Creating Local Backup on D Drive" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$localVersionBackupDir = Join-Path $localBackupDir $nextVersion

# Check if version already exists locally
if (Test-Path $localVersionBackupDir) {
    Write-Host "WARNING: Version $nextVersion already exists locally!" -ForegroundColor Red
    Write-Host "Backup directory: $localVersionBackupDir" -ForegroundColor Yellow
    Write-Host "Removing existing local backup..." -ForegroundColor Yellow
    Remove-Item -Path $localVersionBackupDir -Recurse -Force
}

# Create local backup directory if it doesn't exist
if (-not (Test-Path $localBackupDir)) {
    Write-Host "Creating local backup base directory: $localBackupDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $localBackupDir -Force | Out-Null
}

# Create version backup directory on D drive
Write-Host "Creating local backup directory: $localVersionBackupDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $localVersionBackupDir -Force | Out-Null

# Get current git status
$gitBranch = git branch --show-current 2>$null
$gitCommit = git rev-parse --short HEAD 2>$null
$gitStatus = git status --short 2>$null

Write-Host ""
Write-Host "Git Information:" -ForegroundColor Cyan
Write-Host "  Branch: $gitBranch" -ForegroundColor White
Write-Host "  Commit: $gitCommit" -ForegroundColor White
Write-Host ""

# Files and directories to exclude from backup
$excludePatterns = @(
    "node_modules",
    ".git",
    "*.log",
    "dist",
    "build",
    ".next",
    ".cache",
    "coverage",
    ".nyc_output",
    "*.tmp",
    "*.temp"
)

Write-Host "Starting backup..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

$totalFiles = 0
$totalSize = 0

# Copy source directories
Write-Host "Copying source directories..." -ForegroundColor Yellow
$includeDirs = @("src", "public", "scripts", "tests", "tools", "examples", "docs", "files-upload")

foreach ($dir in $includeDirs) {
    $sourcePath = Join-Path $sourceDir $dir
    if (Test-Path $sourcePath) {
        Write-Host "  Copying $dir..." -ForegroundColor Cyan
        $destPath = Join-Path $localVersionBackupDir $dir
        try {
            Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force -Exclude $excludePatterns -ErrorAction Stop
            $files = Get-ChildItem -Path $sourcePath -Recurse -File -ErrorAction SilentlyContinue
            $totalFiles += $files.Count
            $totalSize += ($files | Measure-Object -Property Length -Sum).Sum
        } catch {
            Write-Host "    Warning: Some files in $dir may not have been copied" -ForegroundColor Yellow
        }
    }
}

# Copy important files from root
Write-Host "Copying important files..." -ForegroundColor Yellow
$rootFiles = Get-ChildItem -Path $sourceDir -File -ErrorAction SilentlyContinue | Where-Object {
    $name = $_.Name
    $ext = $_.Extension
    $name -match '\.(json|ts|tsx|js|html|css|md|bat|ps1|txt)$' -or 
    $name -eq 'package.json' -or 
    $name -eq 'package-lock.json' -or
    $name -eq 'tsconfig.json' -or
    $name -eq 'vite.config.ts' -or
    $name -eq 'server.js' -or
    $name -eq 'index.html' -or
    $name -eq 'README.md'
}

foreach ($file in $rootFiles) {
    Write-Host "  Copying $($file.Name)..." -ForegroundColor Cyan
    try {
        Copy-Item -Path $file.FullName -Destination (Join-Path $localVersionBackupDir $file.Name) -Force -ErrorAction Stop
        $totalFiles++
        $totalSize += $file.Length
    } catch {
        Write-Host "    Warning: Failed to copy $($file.Name)" -ForegroundColor Yellow
    }
}

# Copy streets-gl-alt directory (important)
Write-Host "Copying streets-gl-alt..." -ForegroundColor Yellow
$streetsGLPath = Join-Path $sourceDir "streets-gl-alt"
if (Test-Path $streetsGLPath) {
    $destStreetsGL = Join-Path $localVersionBackupDir "streets-gl-alt"
    Write-Host "  This may take a while (large directory)..." -ForegroundColor Gray
    try {
        Copy-Item -Path $streetsGLPath -Destination $destStreetsGL -Recurse -Force -Exclude $excludePatterns -ErrorAction Stop
        $files = Get-ChildItem -Path $streetsGLPath -Recurse -File -ErrorAction SilentlyContinue
        $totalFiles += $files.Count
        $totalSize += ($files | Measure-Object -Property Length -Sum).Sum
    } catch {
        Write-Host "    Warning: Some files in streets-gl-alt may not have been copied" -ForegroundColor Yellow
    }
}

# Create version info file
Write-Host "Creating version info file..." -ForegroundColor Yellow
$infoFile = Join-Path $localVersionBackupDir "VERSION_INFO.json"
$infoContent = @{
    tag = $nextVersion
    commit = git rev-parse HEAD 2>$null
    date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    message = "Current working version backup"
    backedUpDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    branch = $gitBranch
    shortCommit = $gitCommit
    totalFiles = $totalFiles
    totalSizeMB = [math]::Round($totalSize / 1MB, 2)
} | ConvertTo-Json

Set-Content -Path $infoFile -Value $infoContent -Encoding UTF8

# Also create a text info file
$textInfoFile = Join-Path $localVersionBackupDir "BACKUP_INFO.txt"
$textInfo = @"
Backup Information
==================

Version: $nextVersion
Backup Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Source Directory: $sourceDir
Local Backup Directory: $localVersionBackupDir
External Backup Directory: (will be copied to F:\3d-viever-backup\$nextVersion)

Git Information:
  Branch: $gitBranch
  Commit: $gitCommit
  
Statistics:
  Total Files: $totalFiles
  Backup Size: $([math]::Round($totalSize / 1MB, 2)) MB

Files Excluded:
  - node_modules
  - .git
  - *.log
  - dist, build, .next, .cache
  - temp, tmp directories

Important Directories Included:
  - src/
  - public/
  - scripts/
  - tests/
  - tools/
  - examples/
  - docs/
  - streets-gl-alt/
"@

Set-Content -Path $textInfoFile -Value $textInfo

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "STEP 1 Complete: Local Backup on D Drive" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local Backup:" -ForegroundColor Cyan
Write-Host "  Location: $localVersionBackupDir" -ForegroundColor White
Write-Host "  Total Files: $totalFiles" -ForegroundColor White
Write-Host "  Backup Size: $([math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor White
Write-Host ""

# ========================================
# STEP 2: Copy from D drive to F drive
# ========================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STEP 2: Copying to External Drive (F:)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$externalVersionBackupDir = Join-Path $externalBackupDir $nextVersion

# Check if version already exists on F drive
if (Test-Path $externalVersionBackupDir) {
    Write-Host "WARNING: Version $nextVersion already exists on F drive!" -ForegroundColor Red
    Write-Host "Backup directory: $externalVersionBackupDir" -ForegroundColor Yellow
    Write-Host "Removing existing F drive backup..." -ForegroundColor Yellow
    Remove-Item -Path $externalVersionBackupDir -Recurse -Force
}

# Create external backup directory if it doesn't exist
if (-not (Test-Path $externalBackupDir)) {
    Write-Host "Creating external backup base directory: $externalBackupDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $externalBackupDir -Force | Out-Null
}

# Copy from D drive to F drive
Write-Host "Copying from D drive to F drive..." -ForegroundColor Yellow
Write-Host "  Source: $localVersionBackupDir" -ForegroundColor White
Write-Host "  Destination: $externalVersionBackupDir" -ForegroundColor White
Write-Host "  This may take a while..." -ForegroundColor Gray
Write-Host ""

try {
    # Use Robocopy for better performance
    $robocopyArgs = @(
        $localVersionBackupDir,
        $externalVersionBackupDir,
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
        Write-Host "✅ Successfully copied to F drive!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Warning: Some files may not have been copied (exit code: $exitCode)" -ForegroundColor Yellow
        Write-Host "Trying PowerShell Copy-Item as fallback..." -ForegroundColor Yellow
        Copy-Item -Path $localVersionBackupDir -Destination $externalVersionBackupDir -Recurse -Force -ErrorAction Stop
        Write-Host "✅ Successfully copied to F drive (using fallback method)!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ ERROR: Failed to copy to F drive - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Local backup on D drive is still available at: $localVersionBackupDir" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Version: $nextVersion" -ForegroundColor Green
Write-Host ""
Write-Host "Local Backup (D Drive):" -ForegroundColor Cyan
Write-Host "  Location: $localVersionBackupDir" -ForegroundColor White
Write-Host "  Total Files: $totalFiles" -ForegroundColor White
Write-Host "  Backup Size: $([math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor White
Write-Host ""
Write-Host "External Backup (F Drive):" -ForegroundColor Cyan
if (Test-Path $externalVersionBackupDir) {
    $fFiles = Get-ChildItem $externalVersionBackupDir -Recurse -File -ErrorAction SilentlyContinue
    $fCount = ($fFiles | Measure-Object).Count
    $fSize = [math]::Round(($fFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    Write-Host "  Location: $externalVersionBackupDir" -ForegroundColor White
    Write-Host "  Total Files: $fCount" -ForegroundColor White
    Write-Host "  Backup Size: $fSize MB" -ForegroundColor White
    Write-Host "  Status: ✅ Copied successfully" -ForegroundColor Green
} else {
    Write-Host "  Status: ❌ Not copied (see errors above)" -ForegroundColor Red
}
Write-Host ""
Write-Host "Version info saved to: VERSION_INFO.json" -ForegroundColor Cyan
Write-Host "Backup info saved to: BACKUP_INFO.txt" -ForegroundColor Cyan
Write-Host ""

