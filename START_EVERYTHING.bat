@echo off
title Start Everything - 3D Viewer + Revit Sync
color 0A

cd /d "%~dp0"

echo.
echo ========================================
echo   Starting Everything
echo ========================================
echo.
echo This will start:
echo   1. Revit Sync Server (ports 3002, 3003)
echo   2. StreetsGL Server
echo   3. 3D Viewer Web App (port 3000)
echo.
echo ========================================
echo.

REM Kill existing servers
echo Cleaning up existing servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

echo Starting all services...
echo.

REM Start everything with npm
call npm run dev:with-revit

echo.
echo All services stopped.
pause
