@echo off
echo ========================================
echo Saving Version 2.2 Backup
echo ========================================
echo.
echo This will:
echo 1. Add all changes to git
echo 2. Create a commit for version 2.2
echo 3. Create a git tag v2.2
echo.
pause

echo.
echo Step 1: Adding all files...
git add -A
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to add files
    pause
    exit /b 1
)

echo.
echo Step 2: Creating commit for version 2.2...
git commit -m "Version 2.2 - Post-processing fixes, SSS debugging, disabled auto-reload"
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Commit failed or no changes to commit
    echo This is OK if everything is already committed
)

echo.
echo Step 3: Creating git tag v2.2...
git tag -a v2.2 -m "Version 2.2 - Post-processing fixes, SSS debugging, disabled auto-reload"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Successfully saved Version 2.2!
    echo ========================================
    echo.
    echo Version 2.2 has been tagged.
    echo To restore this version later, run: RESTORE_V2.2.bat
    echo.
    echo Current version: 2.2.0
    echo.
) else (
    echo.
    echo ========================================
    echo ERROR: Failed to create tag v2.2
    echo ========================================
    echo.
    echo The tag might already exist. To update it:
    echo   git tag -d v2.2
    echo   git tag -a v2.2 -m "Version 2.2 - Post-processing fixes, SSS debugging, disabled auto-reload"
    echo   git push origin :refs/tags/v2.2
    echo   git push origin v2.2
    echo.
)

pause



















































