# PowerShell Script to Collect All Revit Connection Logs
# Run: powershell -ExecutionPolicy Bypass -File COLLECT_ALL_LOGS.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COLLECTING ALL REVIT CONNECTION LOGS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportPath = Join-Path $PSScriptRoot "REVIT_LOGS_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

$report = @"
=== REVIT CONNECTION - COMPLETE LOG REPORT ===
Generated: $timestamp
Computer: $env:COMPUTERNAME
User: $env:USERNAME

"@

# 1. Check Server Status
Write-Host "[1/5] Checking server status..." -ForegroundColor Yellow
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "1. SERVER STATUS`n"
$report += "═══════════════════════════════════════════════════════════════`n`n"

try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3002/api/revit/health" -UseBasicParsing -TimeoutSec 2
    $healthData = $healthResponse.Content | ConvertFrom-Json
    $report += "Server Health: OK`n"
    $report += "Clients Connected: $($healthData.clientsConnected)`n"
    $report += "Active Sessions: $($healthData.activeSessions)`n"
    $report += "`n"
} catch {
    $report += "Server Health: NOT AVAILABLE`n"
    $report += "Error: $($_.Exception.Message)`n"
    $report += "`n"
}

try {
    $sessionsResponse = Invoke-WebRequest -Uri "http://localhost:3002/api/revit/sessions" -UseBasicParsing -TimeoutSec 2
    $sessionsData = $sessionsResponse.Content | ConvertFrom-Json
    $report += "Active Sessions:`n"
    if ($sessionsData.sessions -and $sessionsData.sessions.Count -gt 0) {
        foreach ($session in $sessionsData.sessions) {
            $report += "  - Session: $($session.sessionId)`n"
            $report += "    File: $($session.fileName)`n"
            $report += "    Last Update: $($session.lastUpdate)`n"
        }
    } else {
        $report += "  (no active sessions)`n"
    }
    $report += "`n"
} catch {
    $report += "Sessions: ERROR - $($_.Exception.Message)`n"
    $report += "`n"
}

# 2. Check Ports
Write-Host "[2/5] Checking ports..." -ForegroundColor Yellow
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "2. PORT STATUS`n"
$report += "═══════════════════════════════════════════════════════════════`n`n"

$ports = @(3000, 3002, 3003)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $report += "Port $port : LISTENING`n"
        foreach ($conn in $connections) {
            $report += "  PID: $($conn.OwningProcess)`n"
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                $report += "  Process: $($proc.ProcessName)`n"
            }
        }
    } else {
        $report += "Port $port : NOT LISTENING`n"
    }
    $report += "`n"
}

# 3. Revit Journal Files
Write-Host "[3/5] Checking Revit journal files..." -ForegroundColor Yellow
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "3. REVIT JOURNAL FILES`n"
$report += "═══════════════════════════════════════════════════════════════`n`n"

$journalDir = "$env:LOCALAPPDATA\Autodesk\Revit\Autodesk Revit 2026\Journals"
if (Test-Path $journalDir) {
    $latestJournal = Get-ChildItem $journalDir -Filter "*.txt" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if ($latestJournal) {
        $report += "Latest Journal: $($latestJournal.Name)`n"
        $report += "Last Modified: $($latestJournal.LastWriteTime)`n"
        $report += "Size: $([math]::Round($latestJournal.Length / 1KB, 2)) KB`n"
        $report += "`n"
        
        # Search for relevant errors
        $journalContent = Get-Content $latestJournal.FullName -Raw
        $report += "=== RELEVANT ERRORS IN JOURNAL ===`n"
        
        $patterns = @(
            "RevitToWebExporter",
            "GLBExporter",
            "DirectLink",
            "IFC export",
            "export error",
            "export failed",
            "exception",
            "ApplicationException",
            "assembly version conflict",
            "exportToIFC"
        )
        
        $foundErrors = $false
        foreach ($pattern in $patterns) {
            if ($journalContent -match $pattern) {
                $foundErrors = $true
                $matchResults = Select-String -Path $latestJournal.FullName -Pattern $pattern -Context 1,1
                if ($matchResults) {
                    $report += "`nFound: $pattern`n"
                    foreach ($match in $matchResults | Select-Object -First 5) {
                        $report += "  Line $($match.LineNumber): $($match.Line.Trim())`n"
                    }
                }
            }
        }
        
        if (-not $foundErrors) {
            $report += "No relevant errors found in journal.`n"
        }
        
        $report += "`nFull Journal Path: $($latestJournal.FullName)`n"
    } else {
        $report += "No journal files found in: $journalDir`n"
    }
} else {
    $report += "Journal directory not found: $journalDir`n"
}

# 4. Process Information
Write-Host "[4/5] Checking processes..." -ForegroundColor Yellow
$report += "`n═══════════════════════════════════════════════════════════════`n"
$report += "4. RUNNING PROCESSES`n"
$report += "═══════════════════════════════════════════════════════════════`n`n"

$processes = @("node", "Revit", "Code")
foreach ($procName in $processes) {
    $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
    if ($procs) {
        $report += "$procName processes:`n"
        foreach ($proc in $procs) {
            $report += "  PID: $($proc.Id) | CPU: $($proc.CPU) | Memory: $([math]::Round($proc.WS / 1MB, 2)) MB`n"
        }
        $report += "`n"
    }
}

# 5. File System Checks
Write-Host "[5/5] Checking files..." -ForegroundColor Yellow
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "5. FILE SYSTEM CHECKS`n"
$report += "═══════════════════════════════════════════════════════════════`n`n"

$filesToCheck = @(
    "revit-addin\RevitToWebExporter\bin\Release\RevitToWebExporter.dll",
    "revit-addin\RevitToWebExporter\bin\Release\RevitToWebExporter.dll.config",
    "server-revit-sync\server.js",
    "package.json"
)

foreach ($file in $filesToCheck) {
    $fullPath = Join-Path $PSScriptRoot $file
    if (Test-Path $fullPath) {
        $fileInfo = Get-Item $fullPath
        $report += "✅ $file`n"
        $report += "   Size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB`n"
        $report += "   Modified: $($fileInfo.LastWriteTime)`n"
    } else {
        $report += "❌ $file - NOT FOUND`n"
    }
    $report += "`n"
}

# Final summary
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "END OF REPORT`n"
$report += "═══════════════════════════════════════════════════════════════`n"
$report += "`n"
$report += "NEXT STEPS:`n"
$report += "1. Open COLLECT_ALL_LOGS.html in your browser`n"
$report += "2. Click 'Collect Browser Logs' and 'Collect Server Status'`n"
$report += "3. Copy the complete report from the HTML tool`n"
$report += "4. Combine with this report for complete analysis`n"

# Save report
$report | Out-File -FilePath $reportPath -Encoding UTF8

Write-Host ""
Write-Host "✅ Report saved to: $reportPath" -ForegroundColor Green
Write-Host ""
Write-Host "Report contents:" -ForegroundColor Cyan
Write-Host $report
Write-Host ""
Write-Host "Press any key to open the report file..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Open report file
Start-Process notepad.exe -ArgumentList $reportPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LOG COLLECTION COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
