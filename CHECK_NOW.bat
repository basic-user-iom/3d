@echo off
title Diagnostic Check - Server Startup
color 0E
cls
echo.
echo ========================================
echo   DIAGNOSTIC CHECK
echo ========================================
echo.
echo This will check all requirements and
echo show the results in this window.
echo.
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Checking Node.js...
node --version
if errorlevel 1 (
    echo    [FAIL] Node.js not found!
    echo    Please install Node.js from https://nodejs.org/
) else (
    echo    [PASS] Node.js found
)
echo.

echo [2] Checking npm...
npm --version
if errorlevel 1 (
    echo    [FAIL] npm not found!
) else (
    echo    [PASS] npm found
)
echo.

echo [3] Checking current directory...
cd
echo    Current: %CD%
echo.

echo [4] Checking package.json...
if exist "package.json" (
    echo    [PASS] package.json exists
) else (
    echo    [FAIL] package.json NOT FOUND!
)
echo.

echo [5] Checking node_modules...
if exist "node_modules" (
    echo    [PASS] node_modules exists
    if exist "node_modules\.bin\vite.cmd" (
        echo    [PASS] vite.cmd found
    ) else (
        echo    [FAIL] vite.cmd NOT FOUND
    )
) else (
    echo    [FAIL] node_modules NOT FOUND
    echo    Action: Run 'npm install'
)
echo.

echo [6] Checking ports...
netstat -ano | findstr ":3000" >nul 2>&1
if errorlevel 1 (
    echo    [PASS] Port 3000 is available
) else (
    echo    [WARN] Port 3000 is in use
    echo    Processes using port 3000:
    netstat -ano | findstr ":3000"
)
echo.

netstat -ano | findstr ":4000" >nul 2>&1
if errorlevel 1 (
    echo    [PASS] Port 4000 is available
) else (
    echo    [WARN] Port 4000 is in use
)
echo.

echo [7] Testing Vite...
npx vite --version
if errorlevel 1 (
    echo    [FAIL] Vite cannot run
    echo    Error details above
) else (
    echo    [PASS] Vite can run
)
echo.

echo ========================================
echo   DIAGNOSTIC COMPLETE
echo ========================================
echo.
echo If all tests passed, the server should start.
echo If any tests failed, fix those issues first.
echo.
echo Press any key to try starting the server...
pause >nul

echo.
echo ========================================
echo   STARTING SERVER
echo ========================================
echo.
echo Starting: npm run dev
echo.
echo Watch for:
echo   - "webpack compiled successfully" (StreetsGL)
echo   - "Local: http://localhost:3000" (Vite)
echo   - Any error messages
echo.
echo ========================================
echo.

npm run dev

pause


















































