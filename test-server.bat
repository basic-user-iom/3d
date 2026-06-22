@echo off
echo ========================================
echo Testing Server Startup
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found! Please install Node.js from https://nodejs.org/
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
echo Checking if dependencies are installed...
if not exist "node_modules" (
    echo Dependencies not found. Installing...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
)

echo.
echo Checking port 3000...
netstat -ano | findstr :3000 >nul
if not errorlevel 1 (
    echo WARNING: Port 3000 is already in use!
    echo Please close the application using port 3000 or use a different port.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Starting development server...
echo ========================================
echo.
echo The server should start and open in your browser.
echo If it doesn't open automatically, go to: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev

pause
























































