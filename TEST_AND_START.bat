@echo off
title Test and Start Server
color 0E
cls
echo.
echo ========================================
echo   COMPREHENSIVE TEST AND START
echo ========================================
echo.

cd /d "%~dp0"

echo [TEST 1] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo    [FAIL] Node.js not found!
    echo    Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
) else (
    echo    [PASS] Node.js found
    for /f "tokens=*" %%i in ('node --version') do echo    Version: %%i
)
echo.

echo [TEST 2] Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo    [FAIL] npm not found!
    pause
    exit /b 1
) else (
    echo    [PASS] npm found
    for /f "tokens=*" %%i in ('npm --version') do echo    Version: %%i
)
echo.

echo [TEST 3] Checking current directory...
echo    Current: %CD%
if "%CD%"=="D:\ai-cursor\3d-test-software" (
    echo    [PASS] In correct directory
) else (
    echo    [WARN] Not in expected directory
)
echo.

echo [TEST 4] Checking package.json...
if exist "package.json" (
    echo    [PASS] package.json exists
) else (
    echo    [FAIL] package.json NOT FOUND!
    pause
    exit /b 1
)
echo.

echo [TEST 5] Checking node_modules...
if exist "node_modules" (
    echo    [PASS] node_modules exists
    dir /b node_modules | find /c /v "" > temp_count.txt
    set /p module_count=<temp_count.txt
    del temp_count.txt
    echo    Packages: %module_count%
) else (
    echo    [FAIL] node_modules NOT FOUND!
    echo    Installing dependencies now...
    call npm install
    if errorlevel 1 (
        echo    [FAIL] npm install failed!
        pause
        exit /b 1
    )
)
echo.

echo [TEST 6] Checking StreetsGL dependencies...
if exist "streets-gl-alt\node_modules" (
    echo    [PASS] StreetsGL node_modules exists
) else (
    echo    [WARN] StreetsGL node_modules NOT FOUND
    echo    Installing StreetsGL dependencies...
    cd streets-gl-alt
    call npm install
    cd ..
    if errorlevel 1 (
        echo    [WARN] StreetsGL npm install failed - continuing anyway
    )
)
echo.

echo [TEST 7] Checking ports...
netstat -ano | findstr ":3000" >nul 2>&1
if errorlevel 1 (
    echo    [PASS] Port 3000 is available
) else (
    echo    [WARN] Port 3000 is in use
    echo    Processes using port 3000:
    netstat -ano | findstr ":3000"
)
echo.

netstat -ano | findstr ":8081" >nul 2>&1
if errorlevel 1 (
    echo    [PASS] Port 8081 is available
) else (
    echo    [WARN] Port 8081 is in use
)
echo.

echo [TEST 8] Checking Vite installation...
if exist "node_modules\.bin\vite.cmd" (
    echo    [PASS] Vite is installed
) else (
    echo    [FAIL] Vite NOT FOUND in node_modules!
    echo    Run: npm install
    pause
    exit /b 1
)
echo.

echo [TEST 9] Checking concurrently...
if exist "node_modules\.bin\concurrently.cmd" (
    echo    [PASS] concurrently is installed
) else (
    echo    [WARN] concurrently NOT FOUND
)
echo.

echo ========================================
echo   ALL TESTS COMPLETE
echo ========================================
echo.
echo Starting dev server in 3 seconds...
echo.
timeout /t 3 /nobreak >nul

echo ========================================
echo   STARTING SERVER
echo ========================================
echo.
echo This will start:
echo   - StreetsGL server (port 8081)
echo   - Vite dev server (port 3000)
echo.
echo Please wait 30-60 seconds for webpack compilation...
echo Look for these messages:
echo   [StreetsGL] webpack compiled successfully
echo   [3DViewer] Local: http://localhost:3000
echo.
echo Press Ctrl+C to stop the servers
echo.
echo ========================================
echo.

npm run dev

pause


















































