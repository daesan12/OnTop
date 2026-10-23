param(
    [string]$EnvironmentFile = '.env.frontend-test',
    [switch]$Check,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$environmentPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) {
    $EnvironmentFile
} else {
    Join-Path $repository $EnvironmentFile
}
if (-not (Test-Path -LiteralPath $environmentPath)) {
    throw 'Copy .env.frontend-test.example to .env.frontend-test and fill local credentials first.'
}

$allowed = @(
    'DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'AUTH_JWT_SECRET_BASE64', 'AUTH_JWT_ISSUER',
    'FRONTEND_ORIGIN', 'AUTH_FRONTEND_CALLBACK_URI', 'AUTH_REFRESH_COOKIE_SECURE',
    'AUTH_REFRESH_COOKIE_SAME_SITE', 'AUTH_REFRESH_COOKIE_PATH',
    'SSAFY_CLIENT_ID', 'SSAFY_CLIENT_SECRET', 'SSAFY_REDIRECT_URI',
    'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_REDIRECT_URI'
)
$settings = @{}
foreach ($line in Get-Content -LiteralPath $environmentPath -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
        continue
    }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { throw 'Invalid environment file line. Use KEY=value.' }
    $key = $line.Substring(0, $separator).Trim()
    if ($allowed -notcontains $key) { throw "Unsupported environment key: $key" }
    if ($settings.ContainsKey($key)) { throw "Duplicate environment key: $key" }
    $settings[$key] = $line.Substring($separator + 1)
}
foreach ($key in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'AUTH_JWT_SECRET_BASE64')) {
    if ([string]::IsNullOrWhiteSpace($settings[$key])) { throw "Required setting: $key" }
}
if ($settings['DB_URL'] -notmatch '^jdbc:mysql://(?:127\.0\.0\.1|localhost):[0-9]+/ontop_frontend_test(?:\?.*)?$') {
    throw 'Use the dedicated loopback ontop_frontend_test database; shared databases are not allowed.'
}
$keyBytes = [Convert]::FromBase64String($settings['AUTH_JWT_SECRET_BASE64'])
if ($keyBytes.Length -lt 32) { throw 'AUTH_JWT_SECRET_BASE64 must contain at least 32 random bytes.' }
$configuredProviders = @()
foreach ($provider in @('SSAFY', 'NAVER')) {
    if (-not [string]::IsNullOrWhiteSpace($settings["${provider}_CLIENT_ID"]) -and
        -not [string]::IsNullOrWhiteSpace($settings["${provider}_CLIENT_SECRET"])) {
        $expected = "http://localhost:8080/api/v1/auth/$($provider.ToLowerInvariant())/callback"
        if ($settings["${provider}_REDIRECT_URI"] -ne $expected) {
            throw "Register and use the localhost:8080 callback for $provider."
        }
        $configuredProviders += $provider
    }
}
if ($configuredProviders.Count -eq 0) { throw 'Configure at least one real OAuth provider.' }
$origin = if ($settings['FRONTEND_ORIGIN']) { $settings['FRONTEND_ORIGIN'] } else { 'http://localhost:5173' }
$originUri = [Uri]$origin
if ($originUri.Scheme -ne 'http' -or $originUri.Host -ne 'localhost' -or
    $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment -or $originUri.UserInfo) {
    throw 'FRONTEND_ORIGIN must be an HTTP localhost origin. Keep localhost consistent for cookies.'
}
if ($settings['AUTH_FRONTEND_CALLBACK_URI'] -ne "$origin/auth/callback") {
    throw 'AUTH_FRONTEND_CALLBACK_URI must match FRONTEND_ORIGIN + /auth/callback.'
}
Write-Host "Local backend: http://localhost:8080 / ws://localhost:8080/ws/tables"
Write-Host "Frontend: $origin / OAuth providers: $($configuredProviders -join ', ')"
Write-Host 'Channels: channel-1, channel-2. Authentication required; secrets are never printed.'
if ($Check) { return }

$probe = [Net.Sockets.TcpClient]::new()
try {
    $probe.Connect('127.0.0.1', 8080)
    throw 'Port 8080 is already in use. Stop the existing backend before starting this profile.'
} catch [Net.Sockets.SocketException] {
    # An unused local port is expected.
} finally {
    $probe.Dispose()
}
$settings['SPRING_PROFILES_ACTIVE'] = 'local,db,frontend-test'
$settings['WEBSOCKET_AUTHENTICATED'] = 'true'
$previous = @{}
try {
    foreach ($key in $settings.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Push-Location $repository
    try {
        & .\backend\gradlew.bat -p backend bootJar --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
        $jar = Join-Path $repository 'backend/build/libs/ontop-0.0.1-SNAPSHOT.jar'
        if ($Background) {
            $logDirectory = Join-Path $repository 'backend/build/frontend-test'
            [IO.Directory]::CreateDirectory($logDirectory) | Out-Null
            $process = Start-Process -FilePath 'java' -ArgumentList @('-jar', "`"$jar`"") `
                -WorkingDirectory $repository -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $logDirectory 'server.log') `
                -RedirectStandardError (Join-Path $logDirectory 'server-error.log')
            Write-Host "Started local integration backend PID=$($process.Id)."
        } else {
            & java -jar $jar
            if ($LASTEXITCODE -ne 0) { throw 'Backend exited with an error.' }
        }
    } finally {
        Pop-Location
    }
} finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
