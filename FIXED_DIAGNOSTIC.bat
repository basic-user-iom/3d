@echo off
title Fixed Diagnostic
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   FIXED DIAGNOSTIC
echo ========================================
echo.

echo [1] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 goto :node_error
echo    OK: Node.js found
node --version
goto :check_npm

:node_error
echo    ERROR: Node.js NOT found!
goto :end

:check_npm
echo.
echo [2] Checking npm...
where npm >nul 2>&1
if errorlevel 1 goto :npm_error
echo    OK: npm found
npm --version
goto :check_deps

:npm_error
echo    ERROR: npm NOT found!
goto :end

:check_deps
echo.
echo [3] Checking node_modules...
if not exist "node_modules" (
    echo    ERROR: node_modules NOT found!
) else (
    echo    OK: node_modules exists
)

echo.
echo [4] Checking server-revit-sync dependencies...
if not exist "server-revit-sync\node_modules" (
    echo    ERROR: server-revit-sync node_modules NOT found!
) else (
    echo    OK: server-revit-sync node_modules exists
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
echo   DIAGNOSIS COMPLETE
echo ========================================
echo.
echo All checks done. If you see OK for everything above,
echo try running: start-vite-only.bat
echo.

:end
pause
