@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Globe requires Node.js 22.12 or later. Install Node.js, then try again.
  pause
  exit /b 1
)
node "%~dp0scripts\launcher.mjs" %*
if errorlevel 1 (
  echo Globe could not launch. See the message above and %%LOCALAPPDATA%%\Globe logs.
  pause
  exit /b 1
)
