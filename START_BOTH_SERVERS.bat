@echo off
title Start Both Servers - 3D Viewer + Streets GL
color 0B
echo.
echo ========================================
echo   Starting Both Servers
echo ========================================
echo.
echo This will start:
echo   1. Streets GL Server (port 8081)
echo   2. 3D Viewer Server (port 3000)
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

echo.
echo ========================================
echo Starting both servers using npm run dev...
echo ========================================
echo.
echo This will start both servers concurrently.
echo Wait for both to compile (10-30 seconds).
echo.
echo Look for:
echo   - "webpack compiled successfully" (Streets GL)
echo   - "Local: http://localhost:3000" (3D Viewer)
echo.
echo Press Ctrl+C to stop both servers
echo.
echo ========================================
echo.

call npm run dev

pause


