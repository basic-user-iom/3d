@echo off
title Start Vite Simple
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   STARTING VITE SERVER
echo ========================================
echo.
echo This will start Vite on http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo ========================================
echo.

npx vite --host --port 3000 --open

pause
