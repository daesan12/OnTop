param(
  [string]$ApiProxyTarget = 'http://127.0.0.1:8080',
  [ValidateRange(1,65535)][int]$Port = 5288,
  [switch]$ConnectQuest,
  [switch]$ConnectQuestOnly,
  [string]$AdbPath = 'adb',
  [string]$QuestSerial,
  [switch]$LegacyMap
)
$ErrorActionPreference = 'Stop'
$parkXrFrontend = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'quest-local-connection.ps1')
if ($ConnectQuestOnly) {
  Connect-QuestLocalPort -Port $Port -AdbPath $AdbPath -QuestSerial $QuestSerial
  Write-Host "Quest 브라우저: http://localhost:$Port/park"
  return
}
$parkXrProxyUri = $null
if (![Uri]::TryCreate($ApiProxyTarget, [UriKind]::Absolute, [ref]$parkXrProxyUri) -or
    $parkXrProxyUri.Scheme -notin @('http', 'https') -or $parkXrProxyUri.UserInfo -or
    $parkXrProxyUri.Query -or $parkXrProxyUri.Fragment -or $parkXrProxyUri.AbsolutePath -ne '/') {
  throw '-ApiProxyTarget에는 백엔드의 http(s) 기본 주소를 지정해 주세요. 인증 정보·경로·쿼리를 넣지 않습니다.'
}
$parkXrBackend = $parkXrProxyUri.AbsoluteUri.TrimEnd('/')
try {
  $parkXrHealth = Invoke-WebRequest -Uri "$parkXrBackend/actuator/health" -TimeoutSec 5
  if ($parkXrHealth.StatusCode -ne 200) { throw 'Backend health did not return 200.' }
} catch {
  throw "백엔드에 연결할 수 없습니다: $parkXrBackend. 기존 백엔드를 먼저 실행하거나 -ApiProxyTarget에 사용 가능한 테스트 백엔드 주소를 지정해 주세요."
}
$parkXrNode = (Get-Command node -ErrorAction Stop).Source
$parkXrVite = Join-Path $parkXrFrontend 'node_modules/vite/bin/vite.js'
if (!(Test-Path -LiteralPath $parkXrVite)) { throw 'frontend/node_modules가 없습니다. 저장소 의존성을 먼저 준비해 주세요.' }
if ($ConnectQuest) { Connect-QuestLocalPort -Port $Port -AdbPath $AdbPath -QuestSerial $QuestSerial }
$parkXrPreviousProxy = $env:API_PROXY_TARGET
$parkXrMode = if ($LegacyMap) { 'park-integration' } else { 'park-renewal-integration' }
Push-Location -LiteralPath $parkXrFrontend
try {
  $env:API_PROXY_TARGET = $parkXrBackend
  Write-Host "PC와 Quest: http://localhost:$Port/park"
  Write-Host "공원 모드: $parkXrMode. 백엔드에서 같은 맵 버전을 사용해야 합니다."
  Write-Host '기존 로그인과 실제 공원 통신을 사용합니다. 백엔드의 허용 Origin·OAuth 콜백도 이 localhost 주소와 맞춰야 합니다.'
  Write-Host '공원에 입장한 뒤 [공원 VR 시작]을 누르세요. 왼쪽 스틱 이동 / A 점프 / 왼손 그립 달리기 / 오른쪽 스틱 회전 / X 놀이 방법 / B 종료'
  & $parkXrNode $parkXrVite --mode $parkXrMode --host 127.0.0.1 --port $Port --strictPort
  if ($LASTEXITCODE -ne 0) { throw "공원 개발 서버가 종료되었습니다 (exit $LASTEXITCODE)." }
} finally {
  Pop-Location
  $env:API_PROXY_TARGET = $parkXrPreviousProxy
}
