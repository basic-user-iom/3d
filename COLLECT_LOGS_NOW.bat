@echo off
title Collect All Revit Connection Logs
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   COLLECTING ALL REVIT CONNECTION LOGS
echo ========================================
echo.
echo This will:
echo   1. Collect server status and ports
echo   2. Check Revit journal files
echo   3. Check running processes
echo   4. Verify important files exist
echo.
echo Press any key to start...
pause >nul

echo.
echo Running PowerShell script...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0COLLECT_ALL_LOGS.ps1"

echo.
echo ========================================
echo   NEXT STEPS
echo ========================================
echo.
echo 1. Open COLLECT_ALL_LOGS.html in your browser
echo 2. Click "Collect Browser Logs"
echo 3. Click "Collect Server Status"
echo 4. Click "Generate Complete Report"
echo 5. Click "Copy to Clipboard"
echo 6. Share the complete report for analysis
echo.
pause
