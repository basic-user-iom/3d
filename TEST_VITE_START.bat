@echo off
title Test Vite Server Start
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   TESTING VITE SERVER START
echo ========================================
echo.
echo This will test if Vite can start on port 3000
echo.
echo ========================================
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [WARNING] Dependencies not installed!
    echo Run: npm install
    pause
    exit /b 1
)

REM Kill any existing process on port 3000
echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Killing process on port 3000: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo Starting Vite server...
echo Server will be at: http://localhost:3000
echo Press Ctrl+C to stop
echo ========================================
echo.

REM Start Vite directly
npx vite --host --port 3000 --open

pause
