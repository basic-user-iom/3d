@echo off
echo ========================================
echo Starting 3D Test Software Dev Server
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    pause
    exit /b 1
)

echo.
echo Checking dependencies...
if not exist "node_modules" (
    echo WARNING: node_modules not found!
    echo You may need to run: npm install
)

echo.
echo Starting dev server...
echo This will start:
echo   - StreetsGL server (port 8081)
echo   - Vite dev server (port 3000)
echo.
echo Please wait 30-60 seconds for webpack to compile...
echo.

npm run dev

pause


















































