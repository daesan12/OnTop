function Connect-QuestLocalPort {
  param(
    [ValidateRange(1,65535)][int]$Port,
    [string]$AdbPath = 'adb',
    [string]$QuestSerial
  )
  $questAdbCommand = Get-Command $AdbPath -ErrorAction SilentlyContinue
  if (!$questAdbCommand -and $AdbPath -eq 'adb') {
    $questAdbCandidates = @()
    foreach ($questSdkRoot in @($env:ANDROID_SDK_ROOT,$env:ANDROID_HOME)) {
      if ($questSdkRoot) { $questAdbCandidates += Join-Path $questSdkRoot 'platform-tools/adb.exe' }
    }
    $questAdbCandidates += Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
    foreach ($questAdbCandidate in $questAdbCandidates) {
      if (Test-Path -LiteralPath $questAdbCandidate) { $questAdbCommand = Get-Command $questAdbCandidate -ErrorAction Stop; break }
    }
  }
  if (!$questAdbCommand) { throw 'ADB를 찾지 못했습니다. Android SDK platform-tools 설치 후 -AdbPath로 adb.exe 위치를 지정해 주세요.' }
  $questAdbExecutable = $questAdbCommand.Source
  $questDeviceList = & $questAdbExecutable devices
  if ($LASTEXITCODE -ne 0) { throw 'ADB 기기 목록을 읽지 못했습니다.' }
  $questAuthorizedDevices = @($questDeviceList | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
  if ($QuestSerial) {
    if ($questAuthorizedDevices -notcontains $QuestSerial) { throw '지정한 Quest가 연결/승인되지 않았습니다. 헤드셋에서 USB 디버깅을 승인해 주세요.' }
  } elseif ($questAuthorizedDevices.Count -eq 1) {
    $QuestSerial = $questAuthorizedDevices[0]
  } else { throw '승인된 USB 기기 한 대가 필요합니다. Quest 연결·USB 디버깅 승인을 확인하거나 -QuestSerial을 지정해 주세요.' }
  & $questAdbExecutable -s $QuestSerial reverse "tcp:$Port" "tcp:$Port" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Quest USB 포트 연결에 실패했습니다.' }
  Write-Host "Quest USB 연결 완료: localhost:$Port"
  Write-Host "연결 해제: adb -s $QuestSerial reverse --remove tcp:$Port"
}
