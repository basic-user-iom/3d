# Sync missing files from D drive to F drive for v2.3

$dPath = "D:\3d-viever-backup\v2.3"
$fPath = "F:\3d-viever-backup\v2.3"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Syncing v2.3 from D to F Drive" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $dPath)) {
    Write-Host "❌ ERROR: D drive backup not found: $dPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $fPath)) {
    Write-Host "Creating F drive backup directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $fPath -Force | Out-Null
}

Write-Host "Source: $dPath" -ForegroundColor White
Write-Host "Destination: $fPath" -ForegroundColor White
Write-Host ""

# Get all files from D drive
Write-Host "Scanning files on D drive..." -ForegroundColor Yellow
$dFiles = Get-ChildItem $dPath -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($dPath.Length + 1)
    [PSCustomObject]@{
        FullPath = $_.FullName
        RelativePath = $relativePath
        Length = $_.Length
        LastWriteTime = $_.LastWriteTime
    }
}

Write-Host "Found $($dFiles.Count) files on D drive" -ForegroundColor Green
Write-Host ""

# Check which files are missing or different on F drive
Write-Host "Comparing with F drive..." -ForegroundColor Yellow
$missingFiles = @()
$updatedFiles = @()

foreach ($file in $dFiles) {
    $fFilePath = Join-Path $fPath $file.RelativePath
    $fFileDir = Split-Path $fFilePath -Parent
    
    if (-not (Test-Path $fFileDir)) {
        New-Item -ItemType Directory -Path $fFileDir -Force | Out-Null
    }
    
    if (-not (Test-Path $fFilePath)) {
        $missingFiles += $file
    } else {
        $fFile = Get-Item $fFilePath
        if ($file.Length -ne $fFile.Length -or $file.LastWriteTime -gt $fFile.LastWriteTime) {
            $updatedFiles += $file
        }
    }
}

Write-Host "Missing files: $($missingFiles.Count)" -ForegroundColor $(if ($missingFiles.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host "Files to update: $($updatedFiles.Count)" -ForegroundColor $(if ($updatedFiles.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

$totalToSync = $missingFiles.Count + $updatedFiles.Count

if ($totalToSync -eq 0) {
    Write-Host "✅ All files are already synced!" -ForegroundColor Green
    exit 0
}

Write-Host "Syncing $totalToSync files..." -ForegroundColor Yellow
Write-Host ""

$syncedCount = 0
$errorCount = 0

# Sync missing files
foreach ($file in $missingFiles) {
    $destPath = Join-Path $fPath $file.RelativePath
    $destDir = Split-Path $destPath -Parent
    
    try {
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $file.FullPath -Destination $destPath -Force -ErrorAction Stop
        $syncedCount++
        if ($syncedCount % 100 -eq 0) {
            Write-Host "  Synced $syncedCount / $totalToSync files..." -ForegroundColor Gray
        }
    } catch {
        Write-Host "  ⚠️ Failed to copy: $($file.RelativePath)" -ForegroundColor Yellow
        $errorCount++
    }
}

# Sync updated files
foreach ($file in $updatedFiles) {
    $destPath = Join-Path $fPath $file.RelativePath
    
    try {
        Copy-Item -Path $file.FullPath -Destination $destPath -Force -ErrorAction Stop
        $syncedCount++
        if ($syncedCount % 100 -eq 0) {
            Write-Host "  Synced $syncedCount / $totalToSync files..." -ForegroundColor Gray
        }
    } catch {
        Write-Host "  ⚠️ Failed to copy: $($file.RelativePath)" -ForegroundColor Yellow
        $errorCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Sync Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Files synced: $syncedCount" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "Errors: $errorCount" -ForegroundColor Yellow
}
Write-Host ""

# Verify final status
$fFiles = Get-ChildItem $fPath -Recurse -File -ErrorAction SilentlyContinue
$fCount = ($fFiles | Measure-Object).Count
$dCount = $dFiles.Count

Write-Host "Final Status:" -ForegroundColor Cyan
Write-Host "  D Drive: $dCount files" -ForegroundColor White
Write-Host "  F Drive: $fCount files" -ForegroundColor White

if ($dCount -eq $fCount) {
    Write-Host ""
    Write-Host "✅ Files are now in sync!" -ForegroundColor Green
} else {
    $diff = $dCount - $fCount
    Write-Host ""
    Write-Host "⚠️ Still $diff files difference" -ForegroundColor Yellow
}

Write-Host ""



















































