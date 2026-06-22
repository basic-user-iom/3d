@echo off
echo ========================================
echo Restarting Streets GL Dev Server
echo ========================================
echo.
echo This will:
echo   1. Stop any running server on port 8081
echo   2. Start the dev server with new proxy configuration
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

cd /d "%~dp0"

echo Checking for running server on port 8081...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8081 ^| findstr LISTENING') do (
    echo Stopping process %%a...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo Starting Streets GL dev server with proxy configuration...
echo.
echo After server starts, you can verify the proxy by:
echo   1. Check terminal for [Webpack Proxy] log messages
echo   2. Run: node verify-proxy-setup.js (in another terminal)
echo   3. Open http://localhost:8081 and check browser console
echo.
npm run dev

