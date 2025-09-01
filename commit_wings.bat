@echo off
setlocal enabledelayedexpansion
set COMMIT_PREFIX=wings
set ALLOWLIST=wings_paths.txt
set CREATE_NOJEKYLL=1

git --version >nul 2>&1 || (echo [ERROR] Install Git from https://git-scm.com/ & exit /b 1)

if not exist .git (
  echo [INFO] Initializing repo...
  git init || (echo [ERROR] git init failed.& exit /b 1)
  git checkout -b main >nul 2>&1
)

if "%CREATE_NOJEKYLL%"=="1" if not exist .nojekyll (type nul > .nojekyll)

for /f "tokens=*" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURBR=%%B
if "%CURBR%"=="HEAD" (git checkout -B main & set CURBR=main)

if not exist "%ALLOWLIST%" (echo [ERROR] %ALLOWLIST% not found.& exit /b 1)

echo [INFO] Staging wing-related paths...
for /f "usebackq tokens=* delims=" %%P in ("%ALLOWLIST%") do (
  set LINE=%%P
  if not "!LINE!"=="" git add "!LINE!" 2>nul
)

echo.
echo ===== PREVIEW (git status) =====
git status
echo =================================
echo.

set /p CONFIRM=[?] Commit and push WINGS changes (Y/N): 
if /i not "%CONFIRM%"=="Y" (echo [INFO] Aborted.& exit /b 0)

for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set D=%%c-%%a-%%b
for /f "tokens=1-3 delims=:." %%a in ("%time%") do set T=%%a:%%b
set MSG=%COMMIT_PREFIX%: attach/look/function updates | %D%T%T%

git commit -m "%MSG%" || (echo [WARN] Nothing to commit.& exit /b 0)

git remote get-url origin >nul 2>&1 || (
  echo [WARN] No 'origin' remote set.
  echo Set it: git remote add origin https://github.com/<you>/Preset-Wings.git
  exit /b 1
)

echo [INFO] Pushing to %CURBR%...
git push -u origin %CURBR% || (
  echo [ERROR] Push failed. Use GitHub username + Personal Access Token (scope: repo).
  exit /b 1
)

echo [SUCCESS] WINGS pushed to %CURBR%.
exit /b 0
