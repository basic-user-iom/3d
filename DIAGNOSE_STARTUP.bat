@echo off
title Diagnose Startup Issues
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   DIAGNOSING STARTUP ISSUES
echo ========================================
echo.

REM Check Node.js
echo [1/6] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ERROR: Node.js is NOT installed!
    echo    Please install from https://nodejs.org/
    pause
    exit /b 1
) else (
    echo    OK: Node.js found:
    node --version
)

echo.
echo [2/6] Checking npm...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ERROR: npm is NOT installed!
    pause
    exit /b 1
) else (
    echo    OK: npm found:
    npm --version
)

echo.
echo [3/6] Checking dependencies...
if not exist "node_modules" (
    echo    ERROR: node_modules folder NOT found!
    echo    Run: npm install
) else (
    echo    OK: node_modules folder exists
)

echo.
echo [4/6] Checking Revit sync server dependencies...
if not exist "server-revit-sync\node_modules" (
    echo    ERROR: Revit sync server dependencies NOT installed!
    echo    Run: cd server-revit-sync ^&^& npm install
) else (
    echo    OK: Revit sync server dependencies exist
)

echo.
echo [5/6] Checking port 3000...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo    WARNING: Port 3000 is in use!
    echo    This might prevent Vite from starting
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
        echo    Process ID: %%a
    )
) else (
    echo    OK: Port 3000 is available
)

echo.
echo [6/6] Testing if 'concurrently' is installed...
npx concurrently --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ERROR: 'concurrently' package NOT found!
    echo    You can install it with: npm install concurrently --save-dev
) else (
    echo    OK: concurrently is available
    npx concurrently --version
)

echo.
echo ========================================
echo   DIAGNOSIS COMPLETE
echo ========================================
echo.
echo Next steps:
echo 1. If any ERROR messages above, fix them first
echo 2. Then try: TEST_VITE_START.bat (test Vite alone)
echo 3. Then try: ONE_CLICK_START.bat (full startup)
echo.
pause
