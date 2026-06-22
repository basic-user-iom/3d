@echo off
echo ================================================
echo Restore to Version 1.0
echo ================================================
echo.
echo This will restore your project to Version 1.0
echo WARNING: Any uncommitted changes will be lost!
echo.
pause
echo.
echo Restoring to v1.0...
git checkout v1.0
echo.
echo Done! You are now on Version 1.0
echo.
echo To go back to latest version, run:
echo   git checkout master
echo.
pause

