param([switch]$Stop,[string]$DatabaseName='ontop_joke_local_preview_v170')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if($DatabaseName -notmatch '^ontop_joke_local_[a-z0-9_]+$'){throw '아재왕 전용 로컬 DB 이름만 허용합니다.'}
$tools=[IO.Path]::GetFullPath((Join-Path $repo '../local-tools/joke-mysql/mysql-8.4.13-winx64'))
$runtime=Join-Path $repo 'backend/.gradle/ai-joke-db'
$data=Join-Path ([IO.Path]::GetTempPath()) 'ontop-joke-local-mysql-data-v1'
$processFile=Join-Path $runtime 'process.json'
$credentialsFile=Join-Path $runtime 'credentials.json'
if($Stop){
    $listener=Get-NetTCPConnection -State Listen -LocalPort 19306 -ErrorAction SilentlyContinue
    if($listener -and (Test-Path -LiteralPath $processFile)){
        $saved=Get-Content -LiteralPath $processFile -Raw|ConvertFrom-Json
        $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if(!$p -or !$p.CommandLine.Contains($saved.commandDataDirectory) -or !($p.ProcessId -eq $saved.processId -or $p.ParentProcessId -eq $saved.processId)){throw '종료할 전용 MySQL 프로세스 확인 실패'}
        $credentials=Get-Content -LiteralPath $credentialsFile -Raw|ConvertFrom-Json
        $client=Join-Path ([IO.Path]::GetTempPath()) ('ontop-joke-stop-'+[Guid]::NewGuid().ToString('N')+'.cnf')
        try{"[client]`nuser=root`npassword=$($credentials.rootPassword)`nhost=127.0.0.1`nport=19306"|Set-Content -LiteralPath $client -Encoding ascii
            & (Join-Path ([IO.Path]::GetTempPath()) 'ontop-joke-mysql-8.4.13/bin/mysqladmin.exe') "--defaults-extra-file=$client" shutdown
            if($LASTEXITCODE -ne 0){throw '전용 DB 정상 종료 실패'}
            Wait-Process -Id $p.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
            if(Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue){throw 'MySQL 파일 정리 완료를 기다리지 못했습니다. 강제 종료하지 않습니다.'}
        }finally{if(Test-Path -LiteralPath $client){Remove-Item -LiteralPath $client}}
    }
    Write-Host '이 스크립트가 시작한 아재왕 로컬 DB만 종료했습니다. 데이터는 보존합니다.';return
}
if(!(Test-Path -LiteralPath (Join-Path $tools 'bin/mysqld.exe'))){throw 'MySQL 8.4.13 공식 Windows ZIP을 local-tools/joke-mysql에 압축 해제해주세요. 설치 서비스는 필요 없습니다.'}
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$fresh=!(Test-Path -LiteralPath $credentialsFile)
if($fresh){$credentials=[pscustomobject]@{rootPassword=[Guid]::NewGuid().ToString('N');appPassword=[Guid]::NewGuid().ToString('N');initialized=$false};$credentials | ConvertTo-Json | Set-Content -LiteralPath $credentialsFile -Encoding utf8}else{$credentials=Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json}
$fresh=-not $credentials.initialized
$listener=Get-NetTCPConnection -State Listen -LocalPort 19306 -ErrorAction SilentlyContinue
if($listener){
    if(!(Test-Path -LiteralPath $processFile)){throw '19306 포트가 사용 중입니다. 기존 프로세스는 건드리지 않습니다.'}
    $saved=Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $owned=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if(!$owned -or !$owned.CommandLine.Contains($saved.commandDataDirectory) -or !($owned.ProcessId -eq $saved.processId -or $owned.ParentProcessId -eq $saved.processId)){throw '기존 로컬 DB 프로세스 확인 실패'}
}else{
    # MySQL's Windows launcher cannot restart itself from a Korean executable path.
    # Cache the official binaries in an ASCII-only temporary path. Never move/delete existing files.
    $commandTools=Join-Path ([IO.Path]::GetTempPath()) 'ontop-joke-mysql-8.4.13'
    if(!(Test-Path -LiteralPath (Join-Path $commandTools 'bin/mysqld.exe'))){Copy-Item -LiteralPath $tools -Destination $commandTools -Recurse}
    $commandData=$data
    if(!(Test-Path -LiteralPath (Join-Path $data 'mysql'))){$fresh=$true;& (Join-Path $commandTools 'bin/mysqld.exe') --no-defaults --initialize-insecure "--basedir=$commandTools" "--datadir=$data";if($LASTEXITCODE -ne 0){throw '전용 MySQL 초기화 실패'}}
    $arguments=@('--no-defaults','--console',('--basedir="'+$commandTools+'"'),('--datadir="'+$commandData+'"'),'--bind-address=127.0.0.1','--port=19306','--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M')
    $server=Start-Process -FilePath (Join-Path $commandTools 'bin/mysqld.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'mysql.out.log') -RedirectStandardError (Join-Path $runtime 'mysql.err.log')
    @{processId=$server.Id;dataDirectory=$data;commandDataDirectory=$commandData;port=19306}|ConvertTo-Json|Set-Content -LiteralPath $processFile -Encoding utf8
    for($i=0;$i -lt 60;$i++){if($server.HasExited){throw '로컬 MySQL 실행 실패. backend/.gradle/ai-joke-db/mysql.err.log 확인'};if(Get-NetTCPConnection -State Listen -LocalPort 19306 -ErrorAction SilentlyContinue){break};Start-Sleep -Milliseconds 300}
}
$client=Join-Path ([IO.Path]::GetTempPath()) 'ontop-joke-local-client.cnf'
$secret=if($fresh){''}else{$credentials.rootPassword}
"[client]`nuser=root`npassword=$secret`nhost=127.0.0.1`nport=19306`ndefault-character-set=utf8mb4" | Set-Content -LiteralPath $client -Encoding ascii
$sql="CREATE DATABASE IF NOT EXISTS ``$DatabaseName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; CREATE USER IF NOT EXISTS 'ontop_joke_local'@'localhost' IDENTIFIED BY '$($credentials.appPassword)'; GRANT ALL PRIVILEGES ON ``$DatabaseName``.* TO 'ontop_joke_local'@'localhost';"
if($fresh){$sql+=" ALTER USER 'root'@'localhost' IDENTIFIED BY '$($credentials.rootPassword)';"}
$sql | & (Join-Path ([IO.Path]::GetTempPath()) 'ontop-joke-mysql-8.4.13/bin/mysql.exe') "--defaults-extra-file=$client" --batch
if($LASTEXITCODE -ne 0){throw '로컬 전용 DB/계정 준비 실패'}
$credentials | Add-Member -NotePropertyName initialized -NotePropertyValue $true -Force
$credentials | ConvertTo-Json | Set-Content -LiteralPath $credentialsFile -Encoding utf8
Remove-Item -LiteralPath $client
$env:AI_LAB_JOKE_DB_URL="jdbc:mysql://127.0.0.1:19306/${DatabaseName}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8"
$env:AI_LAB_JOKE_DB_USERNAME='ontop_joke_local'
$env:AI_LAB_JOKE_DB_PASSWORD=$credentials.appPassword
Write-Host "아재왕 전용 로컬 MySQL 준비: 127.0.0.1:19306/$DatabaseName (공용 DB 설정 미사용)"
Write-Host '같은 창에서 start-ai-park.cmd를 실행하면 아재왕만 MySQL에 저장합니다. 종료는 이 스크립트 -Stop.'
