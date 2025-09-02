param([switch]$Move=$false,[string]$ModelsFolder="asset/models",[string]$OutputJson="asset/models/models.json")
Write-Host "Scanning for .vrm files..." -ForegroundColor Cyan
$vrms = Get-ChildItem -Path . -Recurse -File -Include *.vrm | Where-Object { $_.FullName -notmatch "\\.git\\|node_modules\\|dist\\|build\\" }
if (-not $vrms) { Write-Warning "No VRM files found."; exit 0 }
if (-not (Test-Path $ModelsFolder)) { New-Item -ItemType Directory -Path $ModelsFolder | Out-Null }
$list=@()
foreach($f in $vrms){
  $rel=$f.FullName.Replace((Get-Location).Path + [System.IO.Path]::DirectorySeparatorChar, "") -replace "\\","/"
  $name=[System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  if($Move){ $dst=Join-Path $ModelsFolder ($name.ToLower()+".vrm"); if(-not (Test-Path $dst)){ Copy-Item $f.FullName $dst; $rel=$dst.Replace((Get-Location).Path + [System.IO.Path]::DirectorySeparatorChar, "") -replace "\\","/" } }
  $list += [pscustomobject]@{ name = $name; file = $rel; wings = "@all" }
}
$list | ConvertTo-Json | Out-File -FilePath $OutputJson -Encoding UTF8; Write-Host "Wrote $OutputJson" -ForegroundColor Green
