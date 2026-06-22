@echo off
setlocal enabledelayedexpansion
title Working Diagnostic
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   WORKING DIAGNOSTIC
echo ========================================
echo.

echo [1] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Node.js NOT found!
    goto :end
) else (
    echo    OK: Node.js found
    node --version
)

echo.
echo [2] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
    echo    ERROR: npm NOT found!
    goto :end
) else (
    echo    OK: npm found
    npm --version
)

echo.
echo [3] Checking node_modules...
if not exist "node_modules" (
    echo    ERROR: node_modules NOT found!
) else (
    echo    OK: node_modules exists
)

echo.
echo [4] Checking server-revit-sync dependencies...
if not exist "server-revit-sync\node_modules" (
    echo    ERROR: server-revit-sync node_modules NOT found!
) else (
    echo    OK: server-revit-sync node_modules exists
)

echo.
echo [5] Checking port 3000...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo    OK: Port 3000 is available
) else (
    echo    WARNING: Port 3000 is in use!
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
        echo    Process ID: %%a
    )
)

echo.
echo [6] Testing concurrently...
npx concurrently --version >nul 2>&1
if errorlevel 1 (
    echo    ERROR: concurrently NOT found!
) else (
    echo    OK: concurrently is available
)

echo.
echo ========================================
echo   DIAGNOSIS COMPLETE
echo ========================================

:end
echo.
pause
