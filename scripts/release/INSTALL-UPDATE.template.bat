@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title JARVIS Armor Workspace - install {{VERSION}}
echo.
echo   JARVIS Armor Workspace - install {{VERSION}} ({{TITLE}})
echo   =========================================================
echo.

rem ---- the update files must be next to this file (zip must be extracted) ----
if not exist "%~dp0update\app.asar" (
  echo   The update files are not next to this installer.
  echo.
  echo   Right-click the zip, choose "Extract All...",
  echo   then open the extracted folder and run INSTALL-UPDATE.bat again.
  echo.
  pause
  exit /b 1
)

rem ---- find where the app is installed ----
set "TARGET="
if exist "%LOCALAPPDATA%\Programs\JARVIS Armor Workspace\resources\app.asar" set "TARGET=%LOCALAPPDATA%\Programs\JARVIS Armor Workspace"
if not defined TARGET if exist "%ProgramFiles%\JARVIS Armor Workspace\resources\app.asar" set "TARGET=%ProgramFiles%\JARVIS Armor Workspace"
if not defined TARGET if exist "%ProgramFiles(x86)%\JARVIS Armor Workspace\resources\app.asar" set "TARGET=%ProgramFiles(x86)%\JARVIS Armor Workspace"
if not defined TARGET (
  for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /v InstallLocation 2^>nul ^| findstr /i "JARVIS"') do set "TARGET=%%B"
)
if not defined TARGET (
  for /f "tokens=2,*" %%A in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /v InstallLocation 2^>nul ^| findstr /i "JARVIS"') do set "TARGET=%%B"
)
if not defined TARGET (
  echo   Could not find JARVIS Armor Workspace on this PC.
  pause
  exit /b 1
)
if not exist "%TARGET%\resources\app.asar" (
  echo   Found "%TARGET%" but it does not look like the app.
  pause
  exit /b 1
)
echo   Installed at: %TARGET%
echo.

rem ---- close JARVIS completely (it keeps running in the tray) ----
echo   Closing JARVIS...
taskkill /im "JARVIS Armor Workspace.exe" /f /t >nul 2>&1
set /a WAITED=0
:waitclose
tasklist /fi "imagename eq JARVIS Armor Workspace.exe" 2>nul | find /i "JARVIS Armor Workspace.exe" >nul
if not errorlevel 1 (
  if !WAITED! geq 15 goto closed
  timeout /t 1 /nobreak >nul
  set /a WAITED+=1
  taskkill /im "JARVIS Armor Workspace.exe" /f /t >nul 2>&1
  goto waitclose
)
:closed
timeout /t 2 /nobreak >nul

rem ---- keep a copy of the old version ----
if not exist "%TARGET%\resources\backup-before-{{VERSION_U}}" mkdir "%TARGET%\resources\backup-before-{{VERSION_U}}" >nul 2>&1
copy /y "%TARGET%\resources\app.asar" "%TARGET%\resources\backup-before-{{VERSION_U}}\app.asar" >nul 2>&1

rem ---- copy the update in ----
echo   Copying the update...
xcopy /e /y /i /q "%~dp0update" "%TARGET%\resources" >nul

rem ---- check it really went in ----
fc /b "%~dp0update\app.asar" "%TARGET%\resources\app.asar" >nul 2>&1
if errorlevel 1 (
  echo.
  echo   The update did NOT copy in - Windows would not let it replace the files.
  echo   1. Right-click the JARVIS icon by the clock and choose Quit ^(or restart the PC^).
  echo   2. Right-click INSTALL-UPDATE.bat and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)
if not exist "%TARGET%\resources\assets\voice\packs\map.json" (
  echo   The new files did not copy in. Try "Run as administrator".
  pause
  exit /b 1
)

echo.
echo   Done - JARVIS is now version {{VERSION}} (shown in Settings, System).
echo   Your old version is kept in resources\backup-before-{{VERSION_U}} if you need it.
echo.
echo   Starting JARVIS...
start "" "%TARGET%\JARVIS Armor Workspace.exe"
timeout /t 4 /nobreak >nul
exit /b 0
