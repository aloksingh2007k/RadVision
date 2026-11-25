$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$modelDir = Join-Path (Split-Path $PSScriptRoot -Parent) "models"
$modelPath = Join-Path $modelDir "yolov8_localization_fractureAtlas.pt"
$modelUrl = "https://raw.githubusercontent.com/XLR8-07/FracAtlas/850ca9a3d23f0e57b006bac952babac1918c0c59/weights/yolov8_localization_fractureAtlas.pt"
$expectedSha256 = "e0763676fa9745284e8845b9b63d656c308f48195a999fd1874ba2dcdb9c524a"

New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
if ((-not (Test-Path -LiteralPath $modelPath)) -or (Get-Item -LiteralPath $modelPath).Length -ne 22527928) {
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
}

$fileInfo = Get-Item -LiteralPath $modelPath
if ($fileInfo.Length -ne 22527928) {
  Remove-Item -LiteralPath $modelPath
  throw "Downloaded model size did not match the pinned FracAtlas artifact."
}
$hashOutput = & certutil.exe -hashfile $modelPath SHA256
$hash = ($hashOutput | Where-Object { $_ -match '^[0-9a-fA-F]{64}$' } | Select-Object -First 1).ToLowerInvariant()
if ($hash -ne $expectedSha256) {
  Remove-Item -LiteralPath $modelPath
  throw "Downloaded model checksum did not match the pinned FracAtlas artifact."
}
Write-Output "FracAtlas model installed ($($fileInfo.Length) bytes, SHA-256 $hash)."
