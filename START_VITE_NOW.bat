@echo off
title Start Vite Now
color 0B

cd /d "%~dp0"

echo Starting Vite server...
echo.
echo Server will be at: http://localhost:3000
echo Press Ctrl+C to stop
echo.

npx vite --host --port 3000 --open

pause
