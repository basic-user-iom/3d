@echo off
title Check Revit Journal for Errors
color 0B

echo.
echo ========================================
echo   CHECKING REVIT JOURNAL FOR ERRORS
echo ========================================
echo.

REM Get the journal directory
set "JOURNAL_DIR=%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals"

echo Looking for journal files in:
echo %JOURNAL_DIR%
echo.

if not exist "%JOURNAL_DIR%" (
    echo [ERROR] Journal directory not found!
    echo Make sure Revit 2026 is installed.
    pause
    exit /b 1
)

echo Finding most recent journal file...
echo.

REM Find the most recent journal file
for /f "delims=" %%f in ('dir /b /o-d "%JOURNAL_DIR%\*.txt" 2^>nul') do (
    set "LATEST_JOURNAL=%%f"
    goto :found
)

:found
if not defined LATEST_JOURNAL (
    echo [ERROR] No journal files found!
    echo Make sure Revit has been run at least once.
    pause
    exit /b 1
)

set "JOURNAL_FILE=%JOURNAL_DIR%\%LATEST_JOURNAL%"

echo Most recent journal: %LATEST_JOURNAL%
echo.
echo ========================================
echo   SEARCHING FOR REVIT ADD-IN ERRORS
echo ========================================
echo.

REM Search for relevant error messages
echo Searching for: RevitToWebExporter, GLBExporter, DirectLink, IFC export...
echo.

findstr /i /c:"RevitToWebExporter" /c:"GLBExporter" /c:"DirectLink" /c:"IFC export" /c:"export error" /c:"export failed" /c:"exception" "%JOURNAL_FILE%" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [FOUND] Relevant messages found!
    echo.
    echo ========================================
    echo   RELEVANT MESSAGES:
    echo ========================================
    echo.
    findstr /i /c:"RevitToWebExporter" /c:"GLBExporter" /c:"DirectLink" /c:"IFC export" /c:"export error" /c:"export failed" /c:"exception" "%JOURNAL_FILE%"
    echo.
    echo ========================================
    echo.
) else (
    echo [INFO] No relevant messages found in journal.
    echo.
    echo This could mean:
    echo   1. The add-in hasn't been used yet
    echo   2. No errors occurred
    echo   3. Errors are logged elsewhere
    echo.
)

echo.
echo ========================================
echo   FULL JOURNAL FILE LOCATION:
echo ========================================
echo %JOURNAL_FILE%
echo.
echo You can open this file in Notepad to see all Revit activity.
echo.
echo ========================================
pause
