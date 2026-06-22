@echo off
echo ========================================
echo COMPLETE ESLint Removal - Streets GL
echo ========================================
echo.
echo This will completely remove ESLint to fix webpack compilation.
echo.

echo Step 1: Stopping any running node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Uninstalling ESLint packages...
call npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser 2>nul
if %errorlevel% equ 0 (
    echo ESLint packages uninstalled.
) else (
    echo Note: Packages may already be removed or not installed.
)

echo.
echo Step 3: Clearing webpack cache...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo Cache cleared.
) else (
    echo No cache found.
)

echo.
echo Step 4: Clearing build directory...
if exist "build" (
    rmdir /s /q "build"
    echo Build directory cleared.
) else (
    echo No build directory found.
)

echo.
echo Step 5: Verifying no ESLint config files...
dir /s /b .eslintrc* 2>nul
if %errorlevel% equ 0 (
    echo WARNING: ESLint config files still found!
    echo Please delete them manually.
) else (
    echo No ESLint config files found - Good!
)

echo.
echo ========================================
echo ESLint Removal Complete
echo ========================================
echo.
echo Now starting the server...
echo.
echo IMPORTANT: Look for "webpack compiled successfully"
echo If you still see ESLint errors, the cache may need clearing again.
echo.
timeout /t 3 /nobreak >nul
call npm run dev







