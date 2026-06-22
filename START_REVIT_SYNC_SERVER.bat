@echo off
title Revit Sync Server
color 0B

cd /d "%~dp0"

REM Check if server-revit-sync exists
if not exist "server-revit-sync" (
    echo [ERROR] server-revit-sync folder not found!
    pause
    exit /b 1
)

cd server-revit-sync

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

REM Kill any existing servers on ports 3002/3003
echo Checking for existing servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do (
    echo Killing process on port 3002: %%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003" ^| findstr "LISTENING"') do (
    echo Killing process on port 3003: %%a
    taskkill /PID %%a /F >nul 2>&1
)

REM Wait for TIME_WAIT to clear (ports in TIME_WAIT will clear automatically, but give it a moment)
echo Waiting for ports to be available...
timeout /t 2 /nobreak >nul 2>&1

echo.
echo ========================================
echo   Revit Sync Server
echo ========================================
echo.
echo Starting server on:
echo   - HTTP: http://localhost:3002
echo   - WebSocket: ws://localhost:3003
echo.
echo This window will stay open while server runs.
echo Press Ctrl+C to stop.
echo ========================================
echo.

REM Enable delayed expansion for ERRORLEVEL
setlocal enabledelayedexpansion

REM Start server and keep it running
node server.js
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo.
    echo [ERROR] Server exited with code %EXIT_CODE%
    echo.
    echo Check the error messages above for details.
    echo.
    echo Common issues:
    echo   - Port already in use (even after cleanup)
    echo   - Missing dependencies (run: npm install)
    echo   - Syntax error in server.js
    echo.
) else (
    echo.
    echo [INFO] Server stopped normally.
    echo.
)

echo.
echo Server stopped.
pause
