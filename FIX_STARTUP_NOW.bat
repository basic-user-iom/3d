@echo off
title Fix Startup - Step by Step
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   FIXING STARTUP ISSUES - STEP BY STEP
echo ========================================
echo.

REM Step 1: Check Node.js
echo [STEP 1] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ❌ Node.js NOT found!
    echo    Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo    ✅ Node.js found: 
node --version
echo.

REM Step 2: Check npm
echo [STEP 2] Checking npm...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ❌ npm NOT found!
    pause
    exit /b 1
)
echo    ✅ npm found:
npm --version
echo.

REM Step 3: Install dependencies if missing
echo [STEP 3] Checking dependencies...
if not exist "node_modules" (
    echo    ⚠️  node_modules NOT found!
    echo    Installing dependencies (this may take a few minutes)...
    call npm install
    if errorlevel 1 (
        echo    ❌ Failed to install dependencies!
        echo    Check the error messages above
        pause
        exit /b 1
    )
    echo    ✅ Dependencies installed!
) else (
    echo    ✅ node_modules exists
)
echo.

REM Step 4: Check if concurrently is installed
echo [STEP 4] Checking 'concurrently' package...
npx concurrently --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ⚠️  'concurrently' NOT found!
    echo    Installing concurrently...
    call npm install concurrently --save-dev
    if errorlevel 1 (
        echo    ❌ Failed to install concurrently!
        pause
        exit /b 1
    )
    echo    ✅ concurrently installed
) else (
    echo    ✅ concurrently is available
)
echo.

REM Step 5: Check Revit sync server dependencies
echo [STEP 5] Checking Revit sync server dependencies...
if not exist "server-revit-sync\node_modules" (
    echo    ⚠️  Revit sync server dependencies NOT installed!
    echo    Installing...
    cd server-revit-sync
    call npm install
    cd ..
    if errorlevel 1 (
        echo    ❌ Failed to install Revit sync server dependencies!
        pause
        exit /b 1
    )
    echo    ✅ Revit sync server dependencies installed
) else (
    echo    ✅ Revit sync server dependencies exist
)
echo.

REM Step 6: Clear ports
echo [STEP 6] Clearing ports 3000, 3002, 3003...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo    Killing process on port 3000: %%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do (
    echo    Killing process on port 3002: %%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003" ^| findstr "LISTENING"') do (
    echo    Killing process on port 3003: %%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul 2>&1
echo    ✅ Ports cleared
echo.

REM Step 7: Test Vite first
echo [STEP 7] Testing if Vite can start...
echo    Starting Vite server (this window will stay open)...
echo    Look for: "VITE v7.x.x ready"
echo    If you see errors, note them down
echo.
echo ========================================
echo   STARTING VITE SERVER
echo ========================================
echo.

REM Start Vite directly to see any errors
npx vite --host --port 3000

echo.
echo ========================================
echo   VITE SERVER STOPPED
echo ========================================
pause
