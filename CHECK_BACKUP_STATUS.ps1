# Backup Status Checker with Progress Bar
# Run this anytime to check backup progress

$backupDir = "F:\3d-viever-backup"
$allVersions = @('v1.0','v1.1','v1.2','v1.3','v1.4','v1.5','v1.6','v1.7','v1.8','v1.9','v2.0','v2.1','v2.2')

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backup Status Checker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $backupDir)) {
    Write-Host "❌ Backup directory not found: $backupDir" -ForegroundColor Red
    exit 1
}

# Get backed up versions
$backedUp = (Get-ChildItem $backupDir -Directory).Name | Sort-Object
$missing = $allVersions | Where-Object { $backedUp -notcontains $_ }

# Progress bar
$progress = [math]::Round(($backedUp.Count / $allVersions.Count) * 100, 1)
Write-Host "Progress: $($backedUp.Count) / $($allVersions.Count) versions ($progress%)" -ForegroundColor $(if ($backedUp.Count -eq 13) { "Green" } else { "Yellow" })
Write-Host ""

# Visual progress bar
$barLength = 50
$filled = [math]::Round(($backedUp.Count / $allVersions.Count) * $barLength)
$empty = $barLength - $filled
$bar = "[" + ("█" * $filled) + ("░" * $empty) + "]"
Write-Host $bar -ForegroundColor $(if ($backedUp.Count -eq 13) { "Green" } else { "Yellow" })
Write-Host ""

# Status
if ($backedUp.Count -eq 13) {
    Write-Host "✅ ALL VERSIONS BACKED UP!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⚠️  Still missing: $($missing.Count) versions" -ForegroundColor Yellow
    Write-Host "Missing: $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
}

# List all versions with status
Write-Host "Version Status:" -ForegroundColor Cyan
foreach ($version in $allVersions) {
    $status = if ($backedUp -contains $version) { "✓" } else { "✗" }
    $color = if ($backedUp -contains $version) { "Green" } else { "Red" }
    Write-Host "  $status $version" -ForegroundColor $color
}
Write-Host ""

# Verify files in each backup
if ($backedUp.Count -gt 0) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Verifying Backup Contents" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    $totalFiles = 0
    $totalSize = 0
    
    foreach ($version in $backedUp) {
        $versionDir = Join-Path $backupDir $version
        $files = Get-ChildItem $versionDir -Recurse -File -ErrorAction SilentlyContinue
        $fileCount = $files.Count
        $size = ($files | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 2)
        
        $totalFiles += $fileCount
        $totalSize += $size
        
        # Check for key files
        $hasPackageJson = Test-Path (Join-Path $versionDir "package.json")
        $hasSrc = Test-Path (Join-Path $versionDir "src")
        $hasViteConfig = Test-Path (Join-Path $versionDir "vite.config.ts")
        $hasVersionInfo = Test-Path (Join-Path $versionDir "VERSION_INFO.json")
        
        $health = "✅"
        $healthColor = "Green"
        if (-not $hasPackageJson -or -not $hasSrc -or -not $hasViteConfig) {
            $health = "⚠️"
            $healthColor = "Yellow"
        }
        
        Write-Host "$health $version" -ForegroundColor $healthColor -NoNewline
        Write-Host " - $fileCount files, $sizeMB MB" -ForegroundColor Gray
        Write-Host "    Package.json: $(if ($hasPackageJson) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasPackageJson) { "Green" } else { "Red" }) -NoNewline
        Write-Host " | Src folder: $(if ($hasSrc) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasSrc) { "Green" } else { "Red" }) -NoNewline
        Write-Host " | Vite config: $(if ($hasViteConfig) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasViteConfig) { "Green" } else { "Red" }) -NoNewline
        Write-Host " | Version info: $(if ($hasVersionInfo) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasVersionInfo) { "Green" } else { "Red" })
    }
    
    Write-Host ""
    Write-Host "Total: $totalFiles files, $([math]::Round($totalSize / 1MB, 2)) MB across all backups" -ForegroundColor Cyan
    Write-Host ""
}

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backup Location: $backupDir" -ForegroundColor Gray
Write-Host "Status: $(if ($backedUp.Count -eq 13) { '✅ Complete' } else { '⏳ In Progress' })" -ForegroundColor $(if ($backedUp.Count -eq 13) { "Green" } else { "Yellow" })
Write-Host ""

if ($backedUp.Count -lt 13) {
    Write-Host "To complete backups, run:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File BACKUP_MISSING_VERSIONS.ps1" -ForegroundColor Cyan
    Write-Host ""
}



















































