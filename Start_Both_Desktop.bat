@echo off
title Start Both - 3D Viewer Desktop + Streets GL
color 0B
echo.
echo ========================================
echo   Start Both: Desktop App + Streets GL
echo ========================================
echo.
echo This will start:
echo   1. Streets GL server (port 8081) - 3D map
echo   2. 3D Viewer Desktop (Electron)
echo.
echo Use City or OSM 3D in the app - the map will load automatically.
echo First start may take 30-60 seconds for Streets GL to compile.
echo.
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo Starting Streets GL + Desktop app...
echo Look for: "webpack compiled" (Streets GL) then the app window will open.
echo Press Ctrl+C in this window to stop both.
echo ========================================
echo.

call npm run desktop:dev

pause
