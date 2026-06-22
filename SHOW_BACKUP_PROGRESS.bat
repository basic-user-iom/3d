@echo off
echo Starting Backup Progress Monitor...
echo This window will show real-time backup progress.
echo.
echo Close the window when done checking.
echo.

start powershell -ExecutionPolicy Bypass -WindowStyle Normal -File "BACKUP_PROGRESS_WINDOW.ps1"

echo Progress window opened!
echo.
pause



















































