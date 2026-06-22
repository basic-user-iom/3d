@echo off
echo ========================================
echo Restoring to Version 2.1
echo ========================================
echo.
echo This will checkout version 2.1 of the project.
echo All uncommitted changes will be LOST!
echo.
pause

git checkout v2.1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Successfully restored to Version 2.1
    echo ========================================
    echo.
    echo Current version: 2.1
    echo To return to latest version, run: git checkout master
    echo.
) else (
    echo.
    echo ========================================
    echo ERROR: Failed to restore to Version 2.1
    echo ========================================
    echo.
    echo Make sure you are in the project root directory
    echo and that git is properly initialized.
    echo.
)

pause
























































