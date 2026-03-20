@echo off
echo ================================
echo Node.js Project Setup Starting
echo ================================

REM Initialize npm project
echo Running npm init...
npm init -y

REM Install dependencies
echo Installing dependencies...
npm install express ejs sqlite3

echo.
echo ================================
echo Setup complete!
echo ================================
pause