# Check v2.3 backup on both D and F drives

Write-Host "Checking v2.3 backup status..." -ForegroundColor Cyan
Write-Host ""

$dPath = "D:\3d-viever-backup\v2.3"
$fPath = "F:\3d-viever-backup\v2.3"

# Check D Drive
Write-Host "D Drive (D:\3d-viever-backup\v2.3):" -ForegroundColor Yellow
if (Test-Path $dPath) {
    $dFiles = Get-ChildItem $dPath -Recurse -File -ErrorAction SilentlyContinue
    $dCount = ($dFiles | Measure-Object).Count
    $dSize = [math]::Round(($dFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    $dHasPkg = Test-Path (Join-Path $dPath "package.json")
    $dHasSrc = Test-Path (Join-Path $dPath "src")
    
    Write-Host "  Status: ✅ EXISTS" -ForegroundColor Green
    Write-Host "  Files: $dCount" -ForegroundColor White
    Write-Host "  Size: $dSize MB" -ForegroundColor White
    Write-Host "  Package.json: $(if($dHasPkg){'✓'}else{'✗'})" -ForegroundColor $(if($dHasPkg){"Green"}else{"Red"})
    Write-Host "  Src folder: $(if($dHasSrc){'✓'}else{'✗'})" -ForegroundColor $(if($dHasSrc){"Green"}else{"Red"})
} else {
    Write-Host "  Status: ❌ NOT FOUND" -ForegroundColor Red
}

Write-Host ""

# Check F Drive
Write-Host "F Drive (F:\3d-viever-backup\v2.3):" -ForegroundColor Yellow
if (Test-Path $fPath) {
    $fFiles = Get-ChildItem $fPath -Recurse -File -ErrorAction SilentlyContinue
    $fCount = ($fFiles | Measure-Object).Count
    $fSize = [math]::Round(($fFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    $fHasPkg = Test-Path (Join-Path $fPath "package.json")
    $fHasSrc = Test-Path (Join-Path $fPath "src")
    
    Write-Host "  Status: ✅ EXISTS" -ForegroundColor Green
    Write-Host "  Files: $fCount" -ForegroundColor White
    Write-Host "  Size: $fSize MB" -ForegroundColor White
    Write-Host "  Package.json: $(if($fHasPkg){'✓'}else{'✗'})" -ForegroundColor $(if($fHasPkg){"Green"}else{"Red"})
    Write-Host "  Src folder: $(if($fHasSrc){'✓'}else{'✗'})" -ForegroundColor $(if($fHasSrc){"Green"}else{"Red"})
    
    # Compare sizes
    if ($dCount -gt 0 -and $fCount -gt 0) {
        $diff = [math]::Abs($dCount - $fCount)
        if ($diff -eq 0) {
            Write-Host ""
            Write-Host "✅ D and F drives have the same file count!" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "⚠️ File count difference: $diff files" -ForegroundColor Yellow
            Write-Host "   D Drive: $dCount files" -ForegroundColor White
            Write-Host "   F Drive: $fCount files" -ForegroundColor White
        }
    }
} else {
    Write-Host "  Status: ❌ NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️ v2.3 exists on D drive but not on F drive!" -ForegroundColor Yellow
    Write-Host "   You may need to copy it from D to F drive." -ForegroundColor Yellow
}

Write-Host ""



















































