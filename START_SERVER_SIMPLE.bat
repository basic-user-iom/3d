@echo off
title 3D Test Software - Dev Server
color 0A
echo.
echo ========================================
echo   3D Test Software - Dev Server
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo    ERROR: Node.js not found!
    echo    Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo    OK
echo.

echo [2/4] Checking dependencies...
if not exist "node_modules" (
    echo    WARNING: node_modules not found!
    echo    Installing dependencies now...
    call npm install
    if errorlevel 1 (
        echo    ERROR: npm install failed!
        pause
        exit /b 1
    )
) else (
    echo    OK
)
echo.

echo [3/4] Checking StreetsGL dependencies...
if not exist "streets-gl-alt\node_modules" (
    echo    WARNING: StreetsGL dependencies missing!
    echo    Installing now...
    cd streets-gl-alt
    call npm install
    cd ..
    if errorlevel 1 (
        echo    ERROR: StreetsGL npm install failed!
        pause
        exit /b 1
    )
) else (
    echo    OK
)
echo.

echo [4/4] Starting dev servers...
echo.
echo    This will start:
echo    - StreetsGL server (port 8081)
echo    - Vite dev server (port 3000)
echo.
echo    Please wait 30-60 seconds for webpack to compile...
echo    Look for "webpack compiled successfully" message.
echo.
echo ========================================
echo.

call npm run dev

pause


















































