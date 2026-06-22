@echo off
title Vite Dev Server Only
color 0B
echo.
echo ========================================
echo Starting Vite Dev Server (Port 3000)
echo ========================================
echo.
echo This will start ONLY the Vite server.
echo StreetsGL will not be started.
echo.
cd /d "%~dp0"

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    pause
    exit /b 1
)

echo.
echo Starting Vite...
echo.
echo Server will be available at: http://localhost:3000
echo Press Ctrl+C to stop
echo.
echo ========================================
echo.

npx vite --host --port 3000 --open

pause


















































