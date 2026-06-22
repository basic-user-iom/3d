@echo off
title Streets GL Server - Quick Start
color 0A
echo.
echo ========================================
echo   Streets GL Server - Quick Start
echo ========================================
echo.
echo This will start the Streets GL server on port 8081
echo.
echo IMPORTANT: Keep this window open while using the 3D Viewer!
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

echo Checking dependencies...
if not exist "node_modules" (
    echo [WARNING] Dependencies not installed!
    echo Installing dependencies now (this may take 5-10 minutes)...
    echo.
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
)

echo ========================================
echo Starting Streets GL Server...
echo ========================================
echo.
echo Server will be available at: http://localhost:8081
echo.
echo Waiting for webpack to compile (10-30 seconds)...
echo Look for: "webpack compiled successfully"
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

call npm run dev

pause


