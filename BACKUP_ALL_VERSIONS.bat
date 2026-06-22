@echo off
echo ========================================
echo Backing Up All Versions
echo ========================================
echo.
echo This will backup all 13 versions to F:\3d-viever-backup
echo This may take several minutes...
echo.
echo Press Ctrl+C to cancel, or wait for it to complete.
echo.
pause

powershell -ExecutionPolicy Bypass -File "BACKUP_ALL_VERSIONS.ps1"

echo.
echo ========================================
echo Backup Complete!
echo ========================================
echo.
pause



















































