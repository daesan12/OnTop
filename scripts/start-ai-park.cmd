@echo off
setlocal
where pwsh.exe >nul 2>&1
if errorlevel 1 goto cached
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ai-park.ps1" %*
exit /b %ERRORLEVEL%
:cached
set "AI_PARK_PWSH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%AI_PARK_PWSH%" goto windows
"%AI_PARK_PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ai-park.ps1" %*
exit /b %ERRORLEVEL%
:windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ai-park.ps1" %*
exit /b %ERRORLEVEL%
