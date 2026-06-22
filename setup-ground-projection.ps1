# Ground Projection Setup Script for Windows PowerShell
# Run this script to copy the ground projection files to your project

param(
    [Parameter(Mandatory=$false)]
    [string]$TargetDir = "."
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ground Projection Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Files to copy
$FilesToCopy = @(
    "ground-projection-setup.js",
    "example-usage.html",
    "standalone-example.html",
    "README-GROUND-PROJECTION.md"
)

# Create target directory if it doesn't exist
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir | Out-Null
    Write-Host "✓ Created directory: $TargetDir" -ForegroundColor Green
}

# Copy files
$CopiedCount = 0
foreach ($File in $FilesToCopy) {
    $SourcePath = Join-Path $ScriptDir $File
    $TargetPath = Join-Path $TargetDir $File
    
    if (Test-Path $SourcePath) {
        Copy-Item -Path $SourcePath -Destination $TargetPath -Force
        Write-Host "✓ Copied: $File" -ForegroundColor Green
        $CopiedCount++
    } else {
        Write-Host "✗ Not found: $File" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "Copied $CopiedCount files to: $TargetDir" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open standalone-example.html in a browser to see it in action" -ForegroundColor White
Write-Host "2. Read README-GROUND-PROJECTION.md for integration guide" -ForegroundColor White
Write-Host "3. Use ground-projection-setup.js in your project" -ForegroundColor White
Write-Host ""
Write-Host "To run the standalone example:" -ForegroundColor Yellow
Write-Host "  Start a local server and open standalone-example.html" -ForegroundColor White
Write-Host ""
Write-Host "Quick server options:" -ForegroundColor Yellow
Write-Host "  • Python:  python -m http.server 8080" -ForegroundColor White
Write-Host "  • Node:    npx http-server -p 8080" -ForegroundColor White
Write-Host "  • PHP:     php -S localhost:8080" -ForegroundColor White
Write-Host ""

# Ask if user wants to start a server
$StartServer = Read-Host "Start a local server now? (y/n)"
if ($StartServer -eq 'y' -or $StartServer -eq 'Y') {
    Set-Location $TargetDir
    Write-Host ""
    Write-Host "Starting http-server on port 8080..." -ForegroundColor Cyan
    Write-Host "Open your browser to: http://localhost:8080/standalone-example.html" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    npx -y http-server -p 8080
}

