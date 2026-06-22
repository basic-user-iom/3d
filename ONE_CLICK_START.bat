@echo off
title Revit Live Link - One Click Start
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   REVIT LIVE LINK - ONE CLICK START
echo ========================================
echo.
echo This will start everything needed for Revit connection:
echo   - Revit Sync Server (ports 3002/3003)
echo   - 3D Viewer Web App (port 3000)
echo.
echo Press Ctrl+C to stop everything
echo ========================================
echo.
echo Press any key to start services...
pause >nul
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    echo Please install Node.js (npm comes with it)
    pause
    exit /b 1
)

REM Kill any existing servers on ports 3000, 3002, 3003
echo Checking for existing servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Killing process on port 3000: %%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do (
    echo Killing process on port 3002: %%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003" ^| findstr "LISTENING"') do (
    echo Killing process on port 3003: %%a
    taskkill /PID %%a /F >nul 2>&1
)

REM Wait for ports to be available
echo Waiting for ports to be available...
timeout /t 2 /nobreak >nul 2>&1

echo.
echo Starting all services...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [WARNING] Dependencies not installed. Installing...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Start Revit Sync Server and Vite (skip StreetsGL for simplicity)
echo Starting Revit Sync Server and 3D Viewer Web App...
echo.
echo IMPORTANT: Watch this window for error messages!
echo If you see any errors (red text), note them down.
echo.
echo Starting services now...
echo.

REM Try to start and capture any errors
call npm run dev:revit-only 2>&1

REM If we get here, the command finished (which means it probably failed)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo   ERROR: Services failed to start!
    echo ========================================
    echo.
    echo Check the error messages above.
    echo.
    echo Common fixes:
    echo 1. Run: DIAGNOSE_STARTUP.bat (to check everything)
    echo 2. Run: FIX_STARTUP_NOW.bat (to fix dependencies)
    echo 3. Run: TEST_VITE_START.bat (to test Vite alone)
    echo.
)

echo.
echo ========================================
echo   Services stopped
echo ========================================
pause
