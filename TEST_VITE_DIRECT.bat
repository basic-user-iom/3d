@echo off
title Test Vite Direct
color 0B

cd /d "%~dp0"

echo.
echo ========================================
echo   TESTING VITE DIRECTLY
echo ========================================
echo.
echo This will test if Vite can start
echo.
echo ========================================
echo.

npx vite --host --port 3000

pause
