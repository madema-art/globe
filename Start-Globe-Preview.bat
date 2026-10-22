@echo off
setlocal
title Globe Preview
call "%~dp0Start-Globe.bat" %*
exit /b %errorlevel%
