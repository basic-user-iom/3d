@echo off
echo ========================================
echo Complete ESLint Removal
echo ========================================
echo.

echo Step 1: Stopping any running node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Uninstalling ESLint packages...
call npm uninstall eslint eslint-webpack-plugin @typescript-eslint/eslint-plugin @typescript-eslint/parser

echo.
echo Step 3: Clearing webpack cache...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo Cache cleared.
)

echo.
echo Step 4: Clearing build directory...
if exist "build" (
    rmdir /s /q "build"
    echo Build directory cleared.
)

echo.
echo Step 5: Verifying no ESLint config files...
dir /s /b .eslintrc* 2>nul
if %errorlevel% equ 0 (
    echo WARNING: ESLint config files still found!
) else (
    echo No ESLint config files found - Good!
)

echo.
echo ========================================
echo ESLint Removal Complete
echo ========================================
echo.
echo Now restart the server with: npm run dev
echo.
echo IMPORTANT: Wait for "webpack compiled successfully"
echo If you still see ESLint errors, webpack cache may need clearing.
echo.
pause







