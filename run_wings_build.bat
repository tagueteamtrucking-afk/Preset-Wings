@echo off
setlocal
set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.1\blender.exe"
if not exist %BLENDER_EXE% set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.0\blender.exe"

echo [1/4] Syncing wings from Google Drive...
call sync_wings.bat

echo [2/4] Running Blender headless build...
if not exist build\logs mkdir build\logs
%BLENDER_EXE% -b -P tools\blender\wings_build.py -- --map wings_map.json 1> build\logs\blender_out.txt 2>&1
if errorlevel 1 (
  echo [ERROR] Blender build failed. See build\logs\blender_out.txt
  exit /b 1
)
echo [OK] Blender exported models to build\out

echo [3/4] Staging changes (wings allow-list)...
call commit_wings.bat
