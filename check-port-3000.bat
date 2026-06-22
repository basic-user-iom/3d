@echo off
title Check Port 3000
color 0E
cls
echo.
echo ========================================
echo   CHECKING PORT 3000
echo ========================================
echo.

echo Checking if port 3000 is in use...
echo.

netstat -ano | findstr ":3000" >nul 2>&1
if errorlevel 1 (
    echo [RESULT] Port 3000 is AVAILABLE
    echo.
    echo No process is using port 3000.
    echo The server should be able to start on this port.
) else (
    echo [RESULT] Port 3000 is IN USE!
    echo.
    echo Processes using port 3000:
    echo.
    netstat -ano | findstr ":3000"
    echo.
    echo To kill a process, use:
    echo   taskkill /PID ^<PID^> /F
    echo.
    echo Replace ^<PID^> with the number from the last column above.
)

echo.
echo ========================================
echo.
pause


















































