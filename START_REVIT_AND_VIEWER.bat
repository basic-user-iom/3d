@echo off
title Revit Live Link - Simple Start
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   REVIT LIVE LINK - SIMPLE START
echo ========================================
echo.
echo This will start:
echo   - Revit Sync Server (ports 3002/3003)
echo   - 3D Viewer Web App (port 3000)
echo.
echo NOTE: StreetsGL is skipped (not needed for Revit)
echo ========================================
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

REM Check if server-revit-sync/node_modules exists
if not exist "server-revit-sync\node_modules" (
    echo [WARNING] Revit sync server dependencies not installed. Installing...
    cd server-revit-sync
    call npm install
    cd ..
    if errorlevel 1 (
        echo [ERROR] Failed to install Revit sync server dependencies!
        pause
        exit /b 1
    )
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
echo Starting services...
echo.

REM Start Revit Sync Server and Vite using the new script
call npm run dev:revit-only

echo.
echo ========================================
echo   Services stopped
echo ========================================
pause
