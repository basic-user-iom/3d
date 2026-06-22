@echo off
title Auto-Start Streets GL Server
color 0A
echo.
echo ========================================
echo   Auto-Starting Streets GL Server
echo ========================================
echo.
echo This script will:
echo   1. Check if Streets GL server is running
echo   2. Start it if not running
echo   3. Keep it running with auto-restart
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

echo.
echo ========================================
echo Starting Streets GL Server Manager...
echo ========================================
echo.
echo The server will:
echo   - Start automatically if not running
echo   - Auto-restart if it crashes
echo   - Run on http://localhost:8081
echo.
echo Press Ctrl+C to stop
echo.
echo ========================================
echo.

call npm run streets-gl:managed

pause


