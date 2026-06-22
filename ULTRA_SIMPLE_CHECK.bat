@echo off
title Ultra Simple Check
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   ULTRA SIMPLE CHECK
echo ========================================
echo.

echo Checking Node.js...
node --version
echo.

echo Checking npm...
npm --version
echo.

echo Checking node_modules...
dir node_modules >nul 2>&1
if errorlevel 1 (
    echo ERROR: node_modules NOT found!
) else (
    echo OK: node_modules exists
)
echo.

echo Checking server-revit-sync dependencies...
dir server-revit-sync\node_modules >nul 2>&1
if errorlevel 1 (
    echo ERROR: server-revit-sync node_modules NOT found!
) else (
    echo OK: server-revit-sync node_modules exists
)
echo.

echo Checking port 3000...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo OK: Port 3000 is available
) else (
    echo WARNING: Port 3000 is in use!
)
echo.

echo ========================================
echo   CHECK COMPLETE
echo ========================================
echo.
pause
