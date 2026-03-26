@echo off
echo ================================
echo Node.js Project Setup Starting
echo ================================

REM Initialize npm project
echo Running npm init...
npm init -y

REM Initialize Localhost
echo Starting localhost...
node app.js

echo.
echo ================================
echo Setup complete!
echo ================================
pause