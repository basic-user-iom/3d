@echo off
cls
echo ========================================
echo BACKUP STATUS CHECKER
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$backupDir = 'F:\3d-viever-backup'; ^
$allVersions = @('v1.0','v1.1','v1.2','v1.3','v1.4','v1.5','v1.6','v1.7','v1.8','v1.9','v2.0','v2.1','v2.2'); ^
if (Test-Path $backupDir) { ^
    $backedUp = (Get-ChildItem $backupDir -Directory).Name | Sort-Object; ^
    $progress = [math]::Round(($backedUp.Count / 13) * 100); ^
    Write-Host 'Progress: $($backedUp.Count) / 13 versions ($progress%%)' -ForegroundColor Yellow; ^
    Write-Host ''; ^
    $bar = '[' + ('#' * [math]::Round($backedUp.Count / 13 * 40)) + ('-' * (40 - [math]::Round($backedUp.Count / 13 * 40))) + ']'; ^
    Write-Host $bar -ForegroundColor Cyan; ^
    Write-Host ''; ^
    Write-Host 'Backed up:' -ForegroundColor Green; ^
    $backedUp | ForEach-Object { Write-Host \"  [OK] $_\" -ForegroundColor Green }; ^
    $missing = $allVersions | Where-Object { $backedUp -notcontains $_ }; ^
    if ($missing) { ^
        Write-Host ''; ^
        Write-Host 'Missing:' -ForegroundColor Red; ^
        $missing | ForEach-Object { Write-Host \"  [  ] $_\" -ForegroundColor Red }; ^
    } else { ^
        Write-Host ''; ^
        Write-Host 'ALL VERSIONS BACKED UP!' -ForegroundColor Green; ^
    } ^
} else { ^
    Write-Host 'Backup directory not found!' -ForegroundColor Red; ^
}"

echo.
echo ========================================
pause



















































