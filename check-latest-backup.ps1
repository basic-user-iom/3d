# Check Latest Backup Version

Write-Host "Checking Latest Backup Versions..." -ForegroundColor Cyan
Write-Host ""

$dPath = "D:\3d-viever-backup"
$fPath = "F:\3d-viever-backup"

# Function to get version number for sorting
function Get-VersionNumber {
    param($version)
    $v = $version -replace '^v', ''
    $parts = $v -split '\.'
    return [int]$parts[0] * 1000 + [int]$parts[1]
}

# Check D Drive
Write-Host "D Drive (D:\3d-viever-backup):" -ForegroundColor Yellow
if (Test-Path $dPath) {
    $dVersions = Get-ChildItem $dPath -Directory | 
        Where-Object { $_.Name -match '^v\d+\.\d+$' } | 
        Select-Object -ExpandProperty Name | 
        Sort-Object { Get-VersionNumber $_ }
    
    if ($dVersions.Count -gt 0) {
        $latestD = $dVersions | Select-Object -Last 1
        Write-Host "  Latest: $latestD" -ForegroundColor Green
        Write-Host "  All versions: $($dVersions -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "  No version directories found" -ForegroundColor Red
    }
} else {
    Write-Host "  Directory not found" -ForegroundColor Red
}

Write-Host ""

# Check F Drive
Write-Host "F Drive (F:\3d-viever-backup):" -ForegroundColor Yellow
if (Test-Path $fPath) {
    $fVersions = Get-ChildItem $fPath -Directory | 
        Where-Object { $_.Name -match '^v\d+\.\d+$' } | 
        Select-Object -ExpandProperty Name | 
        Sort-Object { Get-VersionNumber $_ }
    
    if ($fVersions.Count -gt 0) {
        $latestF = $fVersions | Select-Object -Last 1
        Write-Host "  Latest: $latestF" -ForegroundColor Green
        Write-Host "  All versions: $($fVersions -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "  No version directories found" -ForegroundColor Red
    }
} else {
    Write-Host "  Directory not found" -ForegroundColor Red
}

Write-Host ""

# Overall latest
$allVersions = @()
if (Test-Path $dPath) {
    $allVersions += Get-ChildItem $dPath -Directory | 
        Where-Object { $_.Name -match '^v\d+\.\d+$' } | 
        Select-Object -ExpandProperty Name
}
if (Test-Path $fPath) {
    $allVersions += Get-ChildItem $fPath -Directory | 
        Where-Object { $_.Name -match '^v\d+\.\d+$' } | 
        Select-Object -ExpandProperty Name
}

$allVersions = $allVersions | Sort-Object -Unique { Get-VersionNumber $_ }

if ($allVersions.Count -gt 0) {
    $latest = $allVersions | Select-Object -Last 1
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Overall Latest Backup: $latest" -ForegroundColor Cyan -NoNewline
    Write-Host " (on both drives)" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host "No backup versions found" -ForegroundColor Red
}

Write-Host ""




































