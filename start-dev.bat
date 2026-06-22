@echo off
echo ========================================
echo Starting Bug Fix Server and Vite Dev Server
echo ========================================
echo.
echo This will start:
echo   1. Bug Fix Server (port 3001) - writes bugs to FIXES_APPLIED.md
echo   2. Vite Dev Server (port 3000) - your app
echo.
echo Press Ctrl+C to stop both servers
echo ========================================
echo.
npm run dev:full

