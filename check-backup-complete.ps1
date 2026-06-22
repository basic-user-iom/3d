# Comprehensive Backup Status Checker
# Checks both D and F drives and verifies all files are included

$backupDirF = "F:\3d-viever-backup"
$backupDirD = "D:\3d-viever-backup"
$allVersions = @('v1.0','v1.1','v1.2','v1.3','v1.4','v1.5','v1.6','v1.7','v1.8','v1.9','v2.0','v2.1','v2.2')

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Comprehensive Backup Status Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check current project size
Write-Host "Current Project:" -ForegroundColor Yellow
$currentFiles = Get-ChildItem . -Recurse -File -Exclude 'node_modules','.git' -ErrorAction SilentlyContinue
$currentCount = ($currentFiles | Measure-Object).Count
$currentSize = [math]::Round(($currentFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
Write-Host "  Files: $currentCount" -ForegroundColor White
Write-Host "  Size: $currentSize MB" -ForegroundColor White
Write-Host ""

# Check F Drive
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "F Drive Backup Status (F:\3d-viever-backup)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $backupDirF)) {
    Write-Host "❌ F Drive backup directory not found!" -ForegroundColor Red
} else {
    $backedUpF = (Get-ChildItem $backupDirF -Directory -ErrorAction SilentlyContinue).Name | Sort-Object
    $missingF = $allVersions | Where-Object { $backedUpF -notcontains $_ }
    
    Write-Host "Found $($backedUpF.Count) version directories" -ForegroundColor $(if ($backedUpF.Count -eq 13) { "Green" } else { "Yellow" })
    Write-Host ""
    
    $totalFilesF = 0
    $totalSizeF = 0
    $completeVersionsF = 0
    
    foreach ($version in $allVersions) {
        $versionPath = Join-Path $backupDirF $version
        if (Test-Path $versionPath) {
            $files = Get-ChildItem $versionPath -Recurse -File -ErrorAction SilentlyContinue
            $fileCount = ($files | Measure-Object).Count
            $size = [math]::Round(($files | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
            $hasPkg = Test-Path (Join-Path $versionPath "package.json")
            $hasSrc = Test-Path (Join-Path $versionPath "src")
            $hasVite = Test-Path (Join-Path $versionPath "vite.config.ts")
            
            $totalFilesF += $fileCount
            $totalSizeF += ($files | Measure-Object -Property Length -Sum).Sum
            
            $status = "✅"
            $color = "Green"
            if ($fileCount -eq 0) {
                $status = "❌"
                $color = "Red"
            } elseif (-not $hasPkg -or -not $hasSrc) {
                $status = "⚠️"
                $color = "Yellow"
            } else {
                $completeVersionsF++
            }
            
            Write-Host "$status $version" -ForegroundColor $color -NoNewline
            Write-Host " - $fileCount files, $size MB" -ForegroundColor Gray -NoNewline
            Write-Host " | Package.json: $(if($hasPkg){'✓'}else{'✗'})" -ForegroundColor $(if($hasPkg){"Green"}else{"Red"}) -NoNewline
            Write-Host " | Src: $(if($hasSrc){'✓'}else{'✗'})" -ForegroundColor $(if($hasSrc){"Green"}else{"Red"}) -NoNewline
            Write-Host " | Vite: $(if($hasVite){'✓'}else{'✗'})" -ForegroundColor $(if($hasVite){"Green"}else{"Red"})
        } else {
            Write-Host "❌ $version - NOT FOUND" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "F Drive Summary:" -ForegroundColor Cyan
    Write-Host "  Total Files: $totalFilesF" -ForegroundColor White
    Write-Host "  Total Size: $([math]::Round($totalSizeF / 1MB, 2)) MB" -ForegroundColor White
    Write-Host "  Complete Versions: $completeVersionsF / $($allVersions.Count)" -ForegroundColor $(if ($completeVersionsF -eq 13) { "Green" } else { "Yellow" })
    Write-Host ""
    
    if ($missingF.Count -gt 0) {
        Write-Host "⚠️ Missing versions on F drive: $($missingF -join ', ')" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Check D Drive
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "D Drive Backup Status (D:\3d-viever-backup)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $backupDirD)) {
    Write-Host "❌ D Drive backup directory not found!" -ForegroundColor Red
} else {
    $backedUpD = (Get-ChildItem $backupDirD -Directory -ErrorAction SilentlyContinue).Name | Sort-Object
    
    Write-Host "Found $($backedUpD.Count) version directories" -ForegroundColor Cyan
    Write-Host ""
    
    $totalFilesD = 0
    $totalSizeD = 0
    
    foreach ($version in $backedUpD) {
        $versionPath = Join-Path $backupDirD $version
        $files = Get-ChildItem $versionPath -Recurse -File -ErrorAction SilentlyContinue
        $fileCount = ($files | Measure-Object).Count
        $size = [math]::Round(($files | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
        $hasPkg = Test-Path (Join-Path $versionPath "package.json")
        $hasSrc = Test-Path (Join-Path $versionPath "src")
        
        $totalFilesD += $fileCount
        $totalSizeD += ($files | Measure-Object -Property Length -Sum).Sum
        
        $status = "✅"
        $color = "Green"
        if ($fileCount -eq 0) {
            $status = "❌"
            $color = "Red"
        } elseif (-not $hasPkg -or -not $hasSrc) {
            $status = "⚠️"
            $color = "Yellow"
        }
        
        Write-Host "$status $version" -ForegroundColor $color -NoNewline
        Write-Host " - $fileCount files, $size MB" -ForegroundColor Gray -NoNewline
        Write-Host " | Package.json: $(if($hasPkg){'✓'}else{'✗'})" -ForegroundColor $(if($hasPkg){"Green"}else{"Red"}) -NoNewline
        Write-Host " | Src: $(if($hasSrc){'✓'}else{'✗'})" -ForegroundColor $(if($hasSrc){"Green"}else{"Red"})
    }
    
    Write-Host ""
    Write-Host "D Drive Summary:" -ForegroundColor Cyan
    Write-Host "  Total Files: $totalFilesD" -ForegroundColor White
    Write-Host "  Total Size: $([math]::Round($totalSizeD / 1MB, 2)) MB" -ForegroundColor White
    Write-Host ""
}

# Final Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Final Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allComplete = $true
if (-not (Test-Path $backupDirF)) {
    Write-Host "❌ F Drive backup directory missing!" -ForegroundColor Red
    $allComplete = $false
} else {
    $backedUpF = (Get-ChildItem $backupDirF -Directory -ErrorAction SilentlyContinue).Name
    $missingF = $allVersions | Where-Object { $backedUpF -notcontains $_ }
    if ($missingF.Count -gt 0) {
        Write-Host "❌ F Drive missing versions: $($missingF -join ', ')" -ForegroundColor Red
        $allComplete = $false
    } else {
        Write-Host "✅ F Drive: All 13 versions present" -ForegroundColor Green
    }
}

if ($allComplete) {
    Write-Host ""
    Write-Host "✅ ALL BACKUPS COMPLETE!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️ BACKUP INCOMPLETE - Run BACKUP_MISSING_VERSIONS.ps1 to fix" -ForegroundColor Yellow
}

Write-Host ""



















































