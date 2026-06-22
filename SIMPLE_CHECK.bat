@echo off
title Simple Check
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   SIMPLE CHECK
echo ========================================
echo.

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    pause
    exit /b 1
)

echo.
echo Checking npm...
npm --version
if errorlevel 1 (
    echo ERROR: npm not found!
    pause
    exit /b 1
)

echo.
echo Checking if node_modules exists...
if exist "node_modules" (
    echo OK: node_modules folder exists
) else (
    echo ERROR: node_modules folder NOT found!
    echo Run: npm install
)

echo.
echo Checking if server-revit-sync/node_modules exists...
if exist "server-revit-sync\node_modules" (
    echo OK: Revit sync server dependencies exist
) else (
    echo ERROR: Revit sync server dependencies NOT installed!
    echo Run: cd server-revit-sync ^&^& npm install
)

echo.
echo ========================================
echo   CHECK COMPLETE
echo ========================================
echo.
pause
