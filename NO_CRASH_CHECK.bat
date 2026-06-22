@echo off
title No Crash Check
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   NO CRASH CHECK
echo ========================================
echo.

echo [1] Checking Node.js...
node --version
if errorlevel 1 (
    echo    ERROR: Node.js NOT found!
) else (
    echo    OK: Node.js found
)

echo.
echo [2] Checking npm...
npm --version
if errorlevel 1 (
    echo    ERROR: npm NOT found!
) else (
    echo    OK: npm found
)

echo.
echo [3] Checking node_modules...
if exist "node_modules" (
    echo    OK: node_modules exists
) else (
    echo    ERROR: node_modules NOT found!
)

echo.
echo [4] Checking server-revit-sync dependencies...
if exist "server-revit-sync\node_modules" (
    echo    OK: server-revit-sync node_modules exists
) else (
    echo    ERROR: server-revit-sync node_modules NOT found!
)

echo.
echo [5] Checking port 3000...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo    OK: Port 3000 is available
) else (
    echo    WARNING: Port 3000 is in use!
)

echo.
echo [6] Testing concurrently...
npx concurrently --version >nul 2>&1
if errorlevel 1 (
    echo    ERROR: concurrently NOT found!
) else (
    echo    OK: concurrently is available
)

echo.
echo ========================================
echo   CHECK COMPLETE
echo ========================================
echo.
pause
