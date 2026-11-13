param([switch]$Stop, [switch]$Restart, [switch]$AutoLive, [switch]$Offline, [switch]$LiveJev, [switch]$LiveMattermost, [switch]$NoBuild, [switch]$JokeDb)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $repo 'backend'
$frontend = Join-Path $repo 'frontend'
$runtime = Join-Path $backend '.gradle/ai-park'
$processFile = Join-Path $runtime 'processes.json'

function Stop-OwnedAiPark {
    if (!(Test-Path -LiteralPath $processFile)) { Write-Host '이 스크립트가 기록한 실행 프로세스가 없습니다.'; return }
    $saved = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    foreach ($entry in @(@{ Id=$saved.backend; Marker='com.ssafy.ontop.demo.AiParkApplication' }, @{ Id=$saved.frontend; Marker='vite.ai-park.config.ts' })) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.Id)" -ErrorAction SilentlyContinue
        if ($process -and $process.CommandLine.Contains($entry.Marker) -and $process.CommandLine.Contains($repo)) {
            Stop-Process -Id $entry.Id
            Wait-Process -Id $entry.Id -Timeout 5 -ErrorAction SilentlyContinue
        }
    }
    Write-Host '기록된 AI 검수 프로세스만 종료했습니다. 데이터는 보존합니다.'
}
if ($Stop) { Stop-OwnedAiPark; exit 0 }
if ($Offline -and ($AutoLive -or $LiveJev -or $LiveMattermost)) { throw 'Offline과 실제 연결 옵션은 함께 사용할 수 없습니다.' }
if ($AutoLive) { $LiveJev=[bool]$env:JEV_API_KEY; $LiveMattermost=[bool]$env:AI_LAB_MM_WEBHOOK }
if (!(Test-Path -LiteralPath (Join-Path $frontend 'node_modules/vite/bin/vite.js'))) { throw '기존 frontend 의존성 설치가 필요합니다.' }
if ($LiveJev -and !$env:JEV_API_KEY) { throw 'LiveJev에는 JEV_API_KEY 환경변수가 필요합니다. LLM 키는 필요하지 않습니다.' }
if ($LiveMattermost -and !$env:AI_LAB_MM_WEBHOOK) { throw '실제 MM 전송에는 AI_LAB_MM_WEBHOOK 환경변수가 필요합니다.' }
if ($JokeDb) { & (Join-Path $PSScriptRoot 'start-ai-joke-db.ps1') }
if ($Restart) { Stop-OwnedAiPark }

foreach ($port in @(19191, 5211)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "포트 $port 가 사용 중입니다. 기존 프로세스는 종료하지 않았습니다."
    }
}

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if (!$NoBuild) {
    Push-Location $backend
    try { & .\gradlew.bat aiLabClasspath --console=plain; if ($LASTEXITCODE -ne 0) { throw 'AI 검수 서버 빌드 실패' } }
    finally { Pop-Location }
}
$classpathFile = Join-Path $backend 'build/ai-lab/classpath.txt'
if (!(Test-Path -LiteralPath $classpathFile)) { throw '클래스패스가 없습니다. NoBuild 없이 실행해주세요.' }
$classpath = (Get-Content -LiteralPath $classpathFile -Raw -Encoding utf8).Trim()
$java = (Get-Command java.exe).Source
$node = (Get-Command node.exe).Source
$savedJev = $env:AI_LAB_JEV_LIVE; $savedMm = $env:AI_LAB_MM_LIVE; $savedLlm=$env:OPENAI_API_KEY
try {
    if ($Offline) { $env:OPENAI_API_KEY=$null }
    $env:AI_LAB_JEV_LIVE = if ($LiveJev) { 'true' } else { 'false' }
    $env:AI_LAB_MM_LIVE = if ($LiveMattermost) { 'true' } else { 'false' }
    $server = Start-Process -FilePath $java -ArgumentList @('-Xmx768m', '-cp', ('"' + $classpath + '"'), 'com.ssafy.ontop.demo.AiParkApplication') -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'backend.log') -RedirectStandardError (Join-Path $runtime 'backend.err.log')
    $web = $null
    try {
        $web = Start-Process -FilePath $node -ArgumentList @(('"' + (Join-Path $frontend 'node_modules/vite/bin/vite.js') + '"'), '--config', ('"' + (Join-Path $frontend 'vite.ai-park.config.ts') + '"')) -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'frontend.log') -RedirectStandardError (Join-Path $runtime 'frontend.err.log')
        @{ backend=$server.Id; frontend=$web.Id; createdAt=(Get-Date).ToString('o'); repository=$repo } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8
        $ready = $false
        for ($attempt=0; $attempt -lt 75; $attempt++) {
            if ($server.HasExited -or $web.HasExited) { throw '실행 실패. backend/.gradle/ai-park 로그를 확인해주세요.' }
            try {
                $health = Invoke-WebRequest 'http://127.0.0.1:19191/actuator/health' -TimeoutSec 2 -UseBasicParsing
                $page = Invoke-WebRequest 'http://127.0.0.1:5211/ai-park.html' -TimeoutSec 2 -UseBasicParsing
                if ($health.StatusCode -eq 200 -and $page.StatusCode -eq 200) { $ready=$true; break }
            } catch { Start-Sleep -Milliseconds 400 }
        }
        if (!$ready) { throw '준비 시간 초과. 로그를 확인해주세요.' }
        Write-Host '실제 공원 AI 검수: http://127.0.0.1:5211/ai-park.html'
        Write-Host "백엔드 PID $($server.Id), 프론트 PID $($web.Id). 종료: ./scripts/start-ai-park.ps1 -Stop"
        Write-Host ('Jev 실제 연결: {0}, MM 실제 전송: {1}' -f ([bool]$LiveJev), [bool]$LiveMattermost)
        Write-Host ('LLM 연결 설정: {0} (미설정/실패 시 고정 대사)' -f ([bool]$env:OPENAI_API_KEY))
        Write-Host '데이터는 backend/.gradle/ai-park에 보존합니다. MM 활성화 시 저장된 미전송 알림도 재시도합니다.'
    } catch {
        foreach ($owned in @($web,$server)) { if ($owned -and !$owned.HasExited) { Stop-Process -Id $owned.Id -ErrorAction SilentlyContinue } }
        throw
    }
} finally { $env:AI_LAB_JEV_LIVE=$savedJev; $env:AI_LAB_MM_LIVE=$savedMm; $env:OPENAI_API_KEY=$savedLlm }
