param(
  [switch]$ConnectQuest,
  [string]$AdbPath = 'adb',
  [string]$QuestSerial
)

$ErrorActionPreference = 'Stop'
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$viteScript = Join-Path $frontendDirectory 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $viteScript)) {
  throw 'frontend/node_modules가 없습니다. frontend 폴더에서 먼저 프로젝트 의존성을 설치해 주세요.'
}

if ($ConnectQuest) {
  . (Join-Path $PSScriptRoot 'quest-local-connection.ps1')
  Connect-QuestLocalPort -Port 5187 -AdbPath $AdbPath -QuestSerial $QuestSerial
  Write-Host '퀘스트 브라우저: http://localhost:5187/vr-zone.html'
}
Write-Host 'VR 존: http://127.0.0.1:5187/vr-zone.html'
Write-Host '개별 연습: http://127.0.0.1:5187/skewer.html'
Write-Host '종료: Ctrl+C. 로컬에서만 실행하며 서버 API에 연결하지 않습니다.'
Push-Location -LiteralPath $frontendDirectory
try {
  & $nodeExecutable $viteScript --config vite.skewer.config.ts
  if ($LASTEXITCODE -ne 0) { throw "개발 서버가 종료되었습니다 (exit $LASTEXITCODE)." }
} finally { Pop-Location }
