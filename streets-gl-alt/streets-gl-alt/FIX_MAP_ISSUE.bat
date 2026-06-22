@echo off
echo ========================================
echo Fixing Streets GL Map Issue
echo ========================================
echo.

echo Step 1: Stopping any running processes...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *streets-gl*" 2>nul

echo.
echo Step 2: Clearing webpack cache...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo Cache cleared.
) else (
    echo No cache found.
)

echo.
echo Step 3: Clearing build directory...
if exist "build" (
    rmdir /s /q "build"
    echo Build directory cleared.
) else (
    echo No build directory found.
)

echo.
echo Step 4: Starting Streets GL server...
echo Server will start on http://localhost:8081
echo.
echo IMPORTANT: Wait for "webpack compiled successfully" message
echo before trying to use the map!
echo.
pause
npm run dev







