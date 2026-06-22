@echo off
echo ========================================
echo Backing Up Backup Directory to F Drive
echo ========================================
echo.
echo This will create a mirror copy of F:\3d-viever-backup
echo to F:\3d-viever-backup-mirror
echo.
echo This may take a long time depending on backup size...
echo.
pause

powershell -ExecutionPolicy Bypass -File "BACKUP_BACKUP_TO_F.ps1"

echo.
echo ========================================
echo Backup Complete!
echo ========================================
echo.
pause



















































