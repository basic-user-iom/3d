@echo off
cd /d "%~dp0"
echo Adding Node.js to PATH for this session...
set "PATH=%PATH%;C:\Program Files\nodejs"
echo Starting development server...
echo.
npm run dev

