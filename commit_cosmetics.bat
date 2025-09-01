@echo off
setlocal enabledelayedexpansion

REM ==== CONFIG (optional) ====
set COMMIT_PREFIX=cosmetics
set CREATE_NOJEKYLL=1

REM ==== Detect git ====
git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  echo Install Git from https://git-scm.com/ and try again.
  exit /b 1
)

REM ==== Init repo if needed ====
if not exist .git (
  echo [INFO] No .git folder detected. Initializing repository...
  git init || (echo [ERROR] git init failed.& exit /b 1)
  REM Try to guess default branch (prefer main)
  git checkout -b main >nul 2>&1
)

REM ==== Ensure .nojekyll if requested ====
if "%CREATE_NOJEKYLL%"=="1" (
  if not exist .nojekyll (
    echo [INFO] Creating .nojekyll
    type nul > .nojekyll
  )
)

REM ==== Read branch name (main/master or current) ====
for /f "tokens=*" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURBR=%%B
if "%CURBR%"=="HEAD" (
  REM Detached or fresh init—prefer main
  git checkout -B main
  set CURBR=main
)

REM ==== Stage only allow-listed paths ====
if not exist cosmetics_paths.txt (
  echo [ERROR] cosmetics_paths.txt not found in RepoRoot.
  exit /b 1
)

echo [INFO] Staging allow-listed cosmetic paths...
for /f "usebackq tokens=* delims=" %%P in ("cosmetics_paths.txt") do (
  set LINE=%%P
  if not "!LINE!"=="" (
    git add "!LINE!" 2>nul
  )
)

echo.
echo ===== PREVIEW (git status) =====
git status
echo =================================
echo.

set /p CONFIRM=[?] Proceed with commit and push (Y/N): 
if /i not "%CONFIRM%"=="Y" (
  echo [INFO] Aborted by user.
  exit /b 0
)

REM ==== Make a nice commit message with ISO timestamp ====
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do (
  set D=%%c-%%a-%%b
)
for /f "tokens=1-3 delims=:." %%a in ("%time%") do (
  set T=%%a:%%b
)
set MSG=%COMMIT_PREFIX%: site polish | %D%T%T%

git commit -m "%MSG%" || (
  echo [WARN] Nothing to commit (maybe no changes matched the allow-list?).
  exit /b 0
)

REM ==== Make sure origin exists ====
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [WARN] No 'origin' remote set.
  echo To set it: git remote add origin https://github.com/<you>/<repo>.git
  echo Then re-run this script.
  exit /b 1
)

REM ==== Push ====
echo [INFO] Pushing to %CURBR%...
git push -u origin %CURBR%
if errorlevel 1 (
  echo [ERROR] Push failed. If prompted for credentials, use your GitHub username and a Personal Access Token (classic) as the password (scope: repo).
  exit /b 1
)

echo [SUCCESS] Pushed to %CURBR%.
exit /b 0
