# Verify v2.3 and v2.4 on F drive

Write-Host "Verifying v2.3 and v2.4 on F drive:" -ForegroundColor Cyan
Write-Host ""

foreach ($version in @('v2.3','v2.4')) {
    $path = "F:\3d-viever-backup\$version"
    if (Test-Path $path) {
        $files = Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue
        $count = ($files | Measure-Object).Count
        $size = [math]::Round(($files | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
        $hasPkg = Test-Path (Join-Path $path "package.json")
        $hasSrc = Test-Path (Join-Path $path "src")
        
        Write-Host "$version :" -ForegroundColor Green -NoNewline
        Write-Host " $count files, $size MB" -ForegroundColor White -NoNewline
        Write-Host " | Package.json: $(if($hasPkg){'✓'}else{'✗'})" -ForegroundColor $(if($hasPkg){"Green"}else{"Red"}) -NoNewline
        Write-Host " | Src: $(if($hasSrc){'✓'}else{'✗'})" -ForegroundColor $(if($hasSrc){"Green"}else{"Red"})
    } else {
        Write-Host "$version : NOT FOUND" -ForegroundColor Red
    }
}

Write-Host ""



















































