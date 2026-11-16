param(
  [string]$ApiProxyTarget = 'http://127.0.0.1:8080',
  [ValidateRange(1,65535)][int]$Port = 5202,
  [switch]$ConnectQuest,
  [switch]$ConnectQuestOnly,
  [string]$AdbPath = 'adb',
  [string]$QuestSerial
)

$ErrorActionPreference = 'Stop'
$parkFrontendDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quest-local-connection.ps1')
if ($ConnectQuestOnly) {
  Connect-QuestLocalPort -Port $Port -AdbPath $AdbPath -QuestSerial $QuestSerial
  Write-Host "Quest 브라우저: http://localhost:$Port/park"
  return
}
$parkProxyUri = $null
if (![Uri]::TryCreate($ApiProxyTarget,[UriKind]::Absolute,[ref]$parkProxyUri) -or $parkProxyUri.Scheme -notin @('http','https') -or $parkProxyUri.UserInfo -or $parkProxyUri.Query -or $parkProxyUri.Fragment) {
  throw '-ApiProxyTarget에는 인증 정보나 쿼리가 없는 백엔드 http(s) 주소를 지정해 주세요.'
}
$parkBackendAddress = $parkProxyUri.AbsoluteUri.TrimEnd('/')
try {
  $parkBackendHealth = Invoke-WebRequest -Uri "$parkBackendAddress/actuator/health" -Method Get -TimeoutSec 5
  if ($parkBackendHealth.StatusCode -ne 200) { throw 'Backend health did not return 200.' }
} catch { throw "백엔드에 연결할 수 없습니다: $parkBackendAddress. 서버를 실행하거나 -ApiProxyTarget에 실제 테스트 서버 주소를 지정해 주세요. 로그인 우회/목업으로 대체하지 않습니다." }
$parkNodeExecutable = (Get-Command node -ErrorAction Stop).Source
$parkViteScript = Join-Path $parkFrontendDirectory 'node_modules/vite/bin/vite.js'
if (!(Test-Path -LiteralPath $parkViteScript)) { throw 'frontend/node_modules가 없습니다. 기존 프로젝트 의존성을 준비해 주세요.' }
if ($ConnectQuest) { Connect-QuestLocalPort -Port $Port -AdbPath $AdbPath -QuestSerial $QuestSerial }
$parkPreviousProxyTarget = $env:API_PROXY_TARGET
Push-Location -LiteralPath $parkFrontendDirectory
try {
  $env:API_PROXY_TARGET = $parkBackendAddress
  Write-Host "실제 공원 진입: http://localhost:$Port/park · 꼬치왕 무료 2인 협동"
  Write-Host '서버의 허용 Origin과 OAuth 콜백이 이 localhost 주소를 허용해야 합니다.'
  Write-Host "서버 실행 후 Quest만 추가 연결: .\scripts\start-skewer-park.ps1 -ConnectQuestOnly -Port $Port"
  & $parkNodeExecutable $parkViteScript --mode park-integration --host localhost --port $Port --strictPort
  if ($LASTEXITCODE -ne 0) { throw "공원 개발 서버가 종료되었습니다 (exit $LASTEXITCODE)." }
} finally {
  Pop-Location
  $env:API_PROXY_TARGET = $parkPreviousProxyTarget
}
