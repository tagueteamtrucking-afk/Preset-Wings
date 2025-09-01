param(
  [string]$WingsFolder = "asset/models/wings",
  [string]$OutputJson = "asset/models/wings/wings.json"
)

# Run from RepoRoot. This scans for .fbx, .gltf, .glb, .vrm
$extensions = @(".fbx", ".gltf", ".glb", ".vrm")

if (-not (Test-Path $WingsFolder)) {
  Write-Error "Wings folder not found: $WingsFolder (run from repo root)"
  exit 1
}

$files = Get-ChildItem -Path $WingsFolder -Recurse -File | Where-Object { $extensions -contains $_.Extension.ToLower() } | ForEach-Object {
  $_.FullName.Replace((Get-Location).Path + [System.IO.Path]::DirectorySeparatorChar, "") -replace "\\","/"
}

# Ensure parent folder exists
$parent = Split-Path -Path $OutputJson -Parent
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }

# Write JSON array
$files | ConvertTo-Json | Out-File -FilePath $OutputJson -Encoding UTF8

Write-Host "Wings manifest written to $OutputJson"
