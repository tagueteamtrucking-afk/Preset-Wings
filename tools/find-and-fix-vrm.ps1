param([switch]$Move=$false,[string]$Target="asset/models")
$all = Get-ChildItem -Path . -Recurse -File -Include *.vrm | Where-Object { $_.FullName -notmatch "\\.git\\|node_modules\\|dist\\|build\\" }
if (-not $all) { Write-Host "No VRMs found."; exit 0 }
if ($Move) {
  if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target | Out-Null }
  foreach($f in $all) {
    $clean = ([System.IO.Path]::GetFileNameWithoutExtension($f.Name)).ToLower() + ".vrm"
    $dest = Join-Path $Target $clean
    if (-not (Test-Path $dest)) { Copy-Item $f.FullName $dest; Write-Host "Copied -> $dest" }
  }
  Write-Host "Done."
} else {
  Write-Host "Found VRMs:"; $all | ForEach-Object { Write-Host " - " $_.FullName }
}
