param([switch]$Stop, [switch]$Live, [switch]$LiveJev, [switch]$LiveMattermost, [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $repo 'backend'
$frontend = Join-Path $repo 'frontend'
$runtime = Join-Path $backend '.gradle/ai-lab'
$processFile = Join-Path $runtime 'processes.json'

if ($Stop) {
    if (!(Test-Path -LiteralPath $processFile)) { Write-Host '이 스크립트가 기록한 실행 프로세스가 없습니다.'; exit 0 }
    $saved = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    foreach ($entry in @(@{ Id=$saved.backend; Marker='com.ssafy.ontop.ailab.AiLabApplication' }, @{ Id=$saved.frontend; Marker='vite.ai-lab.config.ts' })) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.Id)" -ErrorAction SilentlyContinue
        if ($process -and $process.CommandLine.Contains($entry.Marker) -and $process.CommandLine.Contains($repo)) {
            Stop-Process -Id $entry.Id
        }
    }
    Write-Host '기록된 AI 검수 프로세스만 종료했습니다. 데이터는 보존합니다.'
    exit 0
}

foreach ($port in @(19190, 5210)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "포트 $port 가 사용 중입니다. 기존 프로세스는 종료하지 않았습니다."
    }
}
if (!(Test-Path -LiteralPath (Join-Path $frontend 'node_modules/vite/bin/vite.js'))) { throw '기존 frontend 의존성 설치가 필요합니다.' }
if ($Live -and (!$env:JEV_API_KEY -or !$env:OPENAI_API_KEY -or !$env:AI_LAB_LLM_MODEL)) { throw 'Live에는 JEV_API_KEY, OPENAI_API_KEY, AI_LAB_LLM_MODEL 환경변수가 필요합니다.' }
if ($LiveJev -and !$env:JEV_API_KEY) { throw 'LiveJev에는 JEV_API_KEY 환경변수가 필요합니다. LLM 키는 필요하지 않습니다.' }
if ($LiveMattermost -and !$env:AI_LAB_MM_WEBHOOK) { throw '실제 MM 전송에는 AI_LAB_MM_WEBHOOK 환경변수가 필요합니다.' }

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if (!$NoBuild) {
    Push-Location $backend
    try { & .\gradlew.bat aiLabClasspath --console=plain; if ($LASTEXITCODE -ne 0) { throw 'AI 검수 서버 빌드 실패' } }
    finally { Pop-Location }
}
$classpathFile = Join-Path $backend 'build/ai-lab/classpath.txt'
if (!(Test-Path -LiteralPath $classpathFile)) { throw '클래스패스가 없습니다. NoBuild 없이 실행해주세요.' }
$classpath = (Get-Content -LiteralPath $classpathFile -Raw).Trim()
$java = (Get-Command java.exe).Source
$node = (Get-Command node.exe).Source
$savedLive = $env:AI_LAB_LIVE; $savedJev = $env:AI_LAB_JEV_LIVE; $savedMm = $env:AI_LAB_MM_LIVE; $savedRapfi = $env:AI_LAB_RAPFI_PATH
try {
    $env:AI_LAB_LIVE = if ($Live) { 'true' } else { 'false' }
    $env:AI_LAB_JEV_LIVE = if ($LiveJev) { 'true' } else { 'false' }
    $env:AI_LAB_MM_LIVE = if ($LiveMattermost) { 'true' } else { 'false' }
    if (!$env:AI_LAB_RAPFI_PATH) {
        $installed = Join-Path (Split-Path $repo -Parent) 'local-tools/ai-lab/rapfi-250615/pbrain-rapfi-windows-avx2.exe'
        if (Test-Path -LiteralPath $installed) { $env:AI_LAB_RAPFI_PATH = $installed }
    }
    $server = Start-Process -FilePath $java -ArgumentList @('-Xmx512m', '-cp', ('"' + $classpath + '"'), 'com.ssafy.ontop.ailab.AiLabApplication') -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'backend.log') -RedirectStandardError (Join-Path $runtime 'backend.err.log')
    $web = $null
    try {
        $web = Start-Process -FilePath $node -ArgumentList @(('"' + (Join-Path $frontend 'node_modules/vite/bin/vite.js') + '"'), '--config', ('"' + (Join-Path $frontend 'vite.ai-lab.config.ts') + '"')) -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'frontend.log') -RedirectStandardError (Join-Path $runtime 'frontend.err.log')
        @{ backend=$server.Id; frontend=$web.Id; createdAt=(Get-Date).ToString('o'); repository=$repo } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8
        $ready = $false
        for ($attempt=0; $attempt -lt 25; $attempt++) {
            if ($server.HasExited -or $web.HasExited) { throw '실행 실패. backend/.gradle/ai-lab 로그를 확인해주세요.' }
            try {
                $health = Invoke-WebRequest 'http://127.0.0.1:19190/actuator/health' -TimeoutSec 2
                $page = Invoke-WebRequest 'http://127.0.0.1:5210/ai-lab.html' -TimeoutSec 2
                if ($health.StatusCode -eq 200 -and $page.StatusCode -eq 200) { $ready=$true; break }
            } catch { Start-Sleep -Milliseconds 400 }
        }
        if (!$ready) { throw '준비 시간 초과. 로그를 확인해주세요.' }
        Write-Host 'AI 로컬 검수: http://127.0.0.1:5210/ai-lab.html'
        Write-Host "백엔드 PID $($server.Id), 프론트 PID $($web.Id). 종료: ./scripts/start-ai-lab.ps1 -Stop"
        Write-Host ('Jev 실제 연결: {0}, LLM 실제 연결: {1}, MM 실제 전송: {2}' -f ([bool]($Live -or $LiveJev)), [bool]$Live, [bool]$LiveMattermost)
        Write-Host '데이터는 backend/.gradle/ai-lab에 보존합니다. MM 활성화 시 저장된 미전송 알림도 재시도합니다.'
    } catch {
        foreach ($owned in @($web,$server)) { if ($owned -and !$owned.HasExited) { Stop-Process -Id $owned.Id -ErrorAction SilentlyContinue } }
        throw
    }
} finally { $env:AI_LAB_LIVE=$savedLive; $env:AI_LAB_JEV_LIVE=$savedJev; $env:AI_LAB_MM_LIVE=$savedMm; $env:AI_LAB_RAPFI_PATH=$savedRapfi }
