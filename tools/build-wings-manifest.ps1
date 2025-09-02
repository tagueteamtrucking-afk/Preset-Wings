param([string]$WingsFolder="asset/models/wings",[string]$OutputJson="asset/models/wings/wings.json")
$ext=@(".fbx",".gltf",".glb",".vrm",".png"); if(-not (Test-Path $WingsFolder)){ Write-Error "Missing $WingsFolder"; exit 1 }
$files=Get-ChildItem -Path $WingsFolder -Recurse -File | Where-Object { $ext -contains $_.Extension.ToLower() } | ForEach-Object {
 $_.FullName.Replace((Get-Location).Path + [System.IO.Path]::DirectorySeparatorChar, "") -replace "\\","/"
}
$parent=Split-Path -Path $OutputJson -Parent; if(-not (Test-Path $parent)){ New-Item -ItemType Directory -Path $parent | Out-Null }
$files | ConvertTo-Json | Out-File -FilePath $OutputJson -Encoding UTF8
Write-Host "Wrote $OutputJson"
