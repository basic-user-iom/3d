@echo off
echo ========================================
echo Streets GL Server Startup Diagnostic
echo ========================================
echo.

echo Checking Node.js installation...
node --version
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo.

echo Checking npm installation...
npm --version
if errorlevel 1 (
    echo ERROR: npm is not installed or not in PATH
    pause
    exit /b 1
)
echo.

echo Checking if dependencies are installed...
if not exist "node_modules" (
    echo WARNING: node_modules folder not found!
    echo Installing dependencies now...
    echo This may take 5-10 minutes...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
) else (
    echo Dependencies folder found.
)
echo.

echo Checking if port 8081 is available...
netstat -ano | findstr :8081 >nul
if not errorlevel 1 (
    echo WARNING: Port 8081 is already in use!
    echo.
    echo Processes using port 8081:
    netstat -ano | findstr :8081
    echo.
    echo You may need to kill the process or use a different port.
    echo.
    set /p killproc="Kill process using port 8081? (y/n): "
    if /i "%killproc%"=="y" (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8081') do (
            echo Killing process %%a...
            taskkill /PID %%a /F >nul 2>&1
        )
        echo Process killed. Waiting 2 seconds...
        timeout /t 2 /nobreak >nul
    )
)
echo.

echo ========================================
echo Starting Streets GL Server...
echo ========================================
echo.
echo Server will be available at: http://localhost:8081
echo.
echo Press Ctrl+C to stop the server
echo.
echo Waiting for webpack to compile (this may take 10-30 seconds)...
echo.

call npm run dev

pause


