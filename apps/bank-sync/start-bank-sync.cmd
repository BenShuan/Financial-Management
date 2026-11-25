@echo off
rem Starts the local bank-sync app against the production API and opens its page.
rem Double-click this file, or make a desktop shortcut to it. Close the window to stop (locks the vault).
setlocal

rem ---- Production API (Render). Change this line if your Render URL is different. ----
set "FM_API_ORIGIN=https://financial-management-api-cjqt.onrender.com"

title FM bank sync
cd /d "%~dp0..\.."

rem Wake the Render API in the background (free plan sleeps; first request can take ~1 min).
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 '%FM_API_ORIGIN%/api/health' | Out-Null } catch {}"

where pnpm >nul 2>nul
if errorlevel 1 (set "PNPM=npx --yes pnpm@9.15.0") else (set "PNPM=pnpm")

echo Preparing...
call %PNPM% --filter @financial-management/shared build >nul
if errorlevel 1 (
  echo Building the shared package failed. Run "%PNPM% install" in the repo root and try again.
  pause
  exit /b 1
)

echo Starting bank sync with API %FM_API_ORIGIN%
call %PNPM% --filter @financial-management/bank-sync local
pause
