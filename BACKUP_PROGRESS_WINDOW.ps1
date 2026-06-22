# Backup Progress Window with GUI
# This opens a visible window showing backup progress

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$backupDir = "F:\3d-viever-backup"
$allVersions = @('v1.0','v1.1','v1.2','v1.3','v1.4','v1.5','v1.6','v1.7','v1.8','v1.9','v2.0','v2.1','v2.2')

# Create form
$form = New-Object System.Windows.Forms.Form
$form.Text = "Backup Progress Monitor"
$form.Size = New-Object System.Drawing.Size(600, 500)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

# Progress bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(20, 20)
$progressBar.Size = New-Object System.Drawing.Size(550, 30)
$progressBar.Style = "Continuous"
$form.Controls.Add($progressBar)

# Status label
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(20, 60)
$statusLabel.Size = New-Object System.Drawing.Size(550, 30)
$statusLabel.Font = New-Object System.Drawing.Font("Arial", 12, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($statusLabel)

# File count label
$fileCountLabel = New-Object System.Windows.Forms.Label
$fileCountLabel.Location = New-Object System.Drawing.Point(20, 90)
$fileCountLabel.Size = New-Object System.Drawing.Size(550, 20)
$fileCountLabel.Font = New-Object System.Drawing.Font("Arial", 9)
$fileCountLabel.ForeColor = [System.Drawing.Color]::Gray
$form.Controls.Add($fileCountLabel)

# List box for versions
$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Location = New-Object System.Drawing.Point(20, 115)
$listBox.Size = New-Object System.Drawing.Size(550, 285)
$listBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($listBox)

# Refresh button
$refreshBtn = New-Object System.Windows.Forms.Button
$refreshBtn.Location = New-Object System.Drawing.Point(20, 410)
$refreshBtn.Size = New-Object System.Drawing.Size(100, 30)
$refreshBtn.Text = "Refresh"
$refreshBtn.Add_Click({
    Update-Progress
})
$form.Controls.Add($refreshBtn)

# Total files/size label
$totalLabel = New-Object System.Windows.Forms.Label
$totalLabel.Location = New-Object System.Drawing.Point(130, 410)
$totalLabel.Size = New-Object System.Drawing.Size(440, 30)
$totalLabel.Font = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Bold)
$totalLabel.ForeColor = [System.Drawing.Color]::DarkBlue
$form.Controls.Add($totalLabel)

# Auto-refresh timer (slower for file comparison to avoid performance issues)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000  # 5 seconds (longer due to file comparison)
$timer.Add_Tick({
    Update-Progress
})
$timer.Start()

# Update function
function Update-Progress {
    if (-not (Test-Path $backupDir)) {
        $statusLabel.Text = "Backup directory not found!"
        $statusLabel.ForeColor = [System.Drawing.Color]::Red
        $progressBar.Value = 0
        $listBox.Items.Clear()
        $listBox.Items.Add("[ERROR] Backup directory not found: $backupDir")
        return
    }
    
    $backedUp = (Get-ChildItem $backupDir -Directory -ErrorAction SilentlyContinue).Name | Sort-Object
    $progress = [math]::Round(($backedUp.Count / $allVersions.Count) * 100)
    
    $progressBar.Value = $progress
    $statusLabel.Text = "Progress: $($backedUp.Count) / $($allVersions.Count) versions ($progress%)"
    
    if ($backedUp.Count -eq $allVersions.Count) {
        $statusLabel.ForeColor = [System.Drawing.Color]::Green
        $statusLabel.Text = "[OK] ALL VERSIONS BACKED UP! ($progress%)"
    } else {
        $statusLabel.ForeColor = [System.Drawing.Color]::Orange
    }
    
    # Update list with file verification and comparison
    $listBox.Items.Clear()
    foreach ($version in $allVersions) {
        if ($backedUp -contains $version) {
            $versionDir = Join-Path $backupDir $version
            try {
                # Get backup stats
                $backupFiles = Get-ChildItem $versionDir -Recurse -File -ErrorAction SilentlyContinue
                $backupFileCount = $backupFiles.Count
                $backupSize = ($backupFiles | Measure-Object -Property Length -Sum).Sum
                $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
                
                # Get original git version stats (temporary checkout)
                $originalFileCount = 0
                $originalSize = 0
                $comparisonStatus = ""
                $currentBranch = git branch --show-current
                $currentCommit = git rev-parse HEAD
                
                try {
                    # Checkout version temporarily (in memory, not actual checkout)
                    $gitArchive = git archive --format=tar $version 2>$null
                    if ($LASTEXITCODE -eq 0) {
                        # Create temp directory for comparison
                        $tempCompareDir = Join-Path $env:TEMP "git-compare-$version"
                        if (Test-Path $tempCompareDir) {
                            Remove-Item -Path $tempCompareDir -Recurse -Force
                        }
                        New-Item -ItemType Directory -Path $tempCompareDir -Force | Out-Null
                        
                        # Extract to temp
                        $archivePath = Join-Path $env:TEMP "$version-compare.zip"
                        git archive --format=zip --output=$archivePath $version 2>$null
                        if (Test-Path $archivePath) {
                            Expand-Archive -Path $archivePath -DestinationPath $tempCompareDir -Force -ErrorAction SilentlyContinue
                            $originalFiles = Get-ChildItem $tempCompareDir -Recurse -File -ErrorAction SilentlyContinue
                            $originalFileCount = $originalFiles.Count
                            $originalSize = ($originalFiles | Measure-Object -Property Length -Sum).Sum
                            
                            # Compare
                            $fileCountMatch = ($backupFileCount -eq $originalFileCount)
                            $sizeDiff = [math]::Abs($backupSize - $originalSize)
                            $sizeDiffPercent = if ($originalSize -gt 0) { [math]::Round(($sizeDiff / $originalSize) * 100, 1) } else { 0 }
                            $sizeMatch = ($sizeDiffPercent -lt 1)  # Within 1% difference
                            
                            if ($fileCountMatch -and $sizeMatch) {
                                $comparisonStatus = " [OK] VERIFIED"
                            } elseif ($fileCountMatch) {
                                $comparisonStatus = " [WARN] Size diff: $sizeDiffPercent%"
                            } elseif ($sizeMatch) {
                                $comparisonStatus = " [WARN] File count diff: $($backupFileCount - $originalFileCount)"
                            } else {
                                $comparisonStatus = " [ERROR] MISMATCH"
                            }
                            
                            # Cleanup
                            Remove-Item -Path $archivePath -Force -ErrorAction SilentlyContinue
                            Remove-Item -Path $tempCompareDir -Recurse -Force -ErrorAction SilentlyContinue
                        }
                    }
                } catch {
                    # Comparison failed, but backup exists
                    $comparisonStatus = " (comparison failed)"
                }
                
                # Check for key files
                $hasPackageJson = Test-Path (Join-Path $versionDir "package.json")
                $hasSrc = Test-Path (Join-Path $versionDir "src")
                
                $health = if ($hasPackageJson -and $hasSrc -and $backupFileCount -gt 100) { "[OK]" } else { "[WARN]" }
                $listBox.Items.Add("$health $version - $backupFileCount files, $backupSizeMB MB$comparisonStatus")
            } catch {
                $listBox.Items.Add("[OK] $version - BACKED UP (verifying...)")
            }
        } else {
            $listBox.Items.Add("[...] $version - PENDING...")
        }
    }
    
    # Calculate totals
    $totalFiles = 0
    $totalSize = 0
    foreach ($version in $backedUp) {
        $versionDir = Join-Path $backupDir $version
        try {
            $files = Get-ChildItem $versionDir -Recurse -File -ErrorAction SilentlyContinue
            $totalFiles += $files.Count
            $totalSize += ($files | Measure-Object -Property Length -Sum).Sum
        } catch {
            # Skip if can't read
        }
    }
    $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
    $totalSizeGB = [math]::Round($totalSize / 1GB, 2)
    
    if ($totalSizeGB -gt 1) {
        $fileCountLabel.Text = "Total: $totalFiles files, $totalSizeGB GB across all backups"
    } else {
        $fileCountLabel.Text = "Total: $totalFiles files, $totalSizeMB MB across all backups"
    }
    
    $totalLabel.Text = "Average: $([math]::Round($totalFiles / [math]::Max($backedUp.Count, 1))) files per version"
    
    # Highlight missing versions
    for ($i = 0; $i -lt $listBox.Items.Count; $i++) {
        if ($listBox.Items[$i] -like "*PENDING*") {
            $listBox.SetSelected($i, $false)
        }
    }
}

# Initial update
Update-Progress

# Show form
$form.Add_Shown({$form.Activate()})
[System.Windows.Forms.Application]::Run($form)

