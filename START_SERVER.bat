@echo off
title Expense Management Cloud Server
cd /d "%~dp0"
echo ========================================================
echo   Starting Expense Management System Backend Server...
echo ========================================================
echo.
node server.js
pause
