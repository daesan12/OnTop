param(
    [Parameter(Mandatory = $true)][string]$EnvironmentFile,
    [int]$Port = 19186,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$settings = @{}
$allowed = @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'AUTH_JWT_SECRET_BASE64', 'AUTH_JWT_ISSUER',
    'AUTH_ALLOWED_ORIGINS', 'AUTH_FRONTEND_CALLBACK_URI', 'SKEWER_COOP_JOURNAL_PATH',
    'SSAFY_CLIENT_ID', 'SSAFY_CLIENT_SECRET', 'SSAFY_REDIRECT_URI',
    'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_REDIRECT_URI')
foreach ($line in Get-Content -LiteralPath $EnvironmentFile -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { throw 'Use KEY=value; environment files are not executable scripts.' }
    $key = $line.Substring(0, $separator).Trim()
    if ($allowed -notcontains $key -or $settings.ContainsKey($key)) { throw "Unsupported or duplicate key: $key" }
    $settings[$key] = $line.Substring($separator + 1)
}
foreach ($key in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'AUTH_JWT_SECRET_BASE64',
        'AUTH_ALLOWED_ORIGINS', 'AUTH_FRONTEND_CALLBACK_URI', 'SKEWER_COOP_JOURNAL_PATH')) {
    if ([string]::IsNullOrWhiteSpace($settings[$key])) { throw "Required setting: $key" }
}
if ($settings.DB_URL -notmatch '^jdbc:mysql://(?:127\.0\.0\.1|localhost):[0-9]+/ontop_skewer_coop_[A-Za-z0-9_]+(?:\?.*)?$') {
    throw 'Use a dedicated loopback ontop_skewer_coop_* database. This launcher does not access shared DEV.'
}
if ([Convert]::FromBase64String($settings.AUTH_JWT_SECRET_BASE64).Length -lt 32) {
    throw 'AUTH_JWT_SECRET_BASE64 must contain at least 32 random bytes.'
}
if (-not [IO.Path]::IsPathFullyQualified($settings.SKEWER_COOP_JOURNAL_PATH)) {
    throw 'SKEWER_COOP_JOURNAL_PATH must be an absolute persistent directory, outside temporary/build output.'
}
$providers = @('SSAFY', 'NAVER') | Where-Object {
    -not [string]::IsNullOrWhiteSpace($settings["${_}_CLIENT_ID"]) -and
    -not [string]::IsNullOrWhiteSpace($settings["${_}_CLIENT_SECRET"])
}
if (-not $providers) { throw 'Configure a real OAuth provider; this launcher has no test login endpoint.' }
foreach ($provider in $providers) {
    $callback = [Uri]$settings["${provider}_REDIRECT_URI"]
    if ($callback.Host -notin @('localhost', '127.0.0.1') -or $callback.Port -ne $Port -or
            $callback.AbsolutePath -ne "/api/v1/auth/$($provider.ToLowerInvariant())/callback") {
        throw "Register the local port $Port callback with $provider before launching."
    }
}
foreach ($file in @('server-map.json', 'manifest.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repository "frontend/generated/park/$file"))) {
        throw 'Generate the current park map first: node scripts/generate-park-map.mjs (from frontend).'
    }
}
if ($Check) { Write-Host 'Configuration structure is valid. DB connectivity and real OAuth login are not yet verified.'; exit 0 }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use; the existing server will not be stopped."
}
$settings.SPRING_PROFILES_ACTIVE = 'local,db,skewer-coop'
$settings.SPRING_PROFILES_INCLUDE = ''
$settings.SERVER_PORT = "$Port"
$settings.SERVER_ADDRESS = '127.0.0.1'
$settings.DB_MIGRATION_LOCATIONS = 'classpath:db/migration,classpath:db/minigame'
$settings.WEBSOCKET_AUTHENTICATED = 'true'
$settings.WORLD_MAP_SOURCE = 'generated'
$settings.WORLD_MAP_REQUIRE_MATCH = 'true'
$settings.WORLD_MAP_JSON_PATH = Join-Path $repository 'frontend/generated/park/server-map.json'
$settings.WORLD_MAP_MANIFEST_PATH = Join-Path $repository 'frontend/generated/park/manifest.json'
$settings.AUTH_REFRESH_COOKIE_SECURE = 'false'
$previous = @{}
try {
    foreach ($key in $settings.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Push-Location (Join-Path $repository 'backend')
    try {
        & ./gradlew.bat bootRun --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'Backend exited with an error. No Flyway repair or DB reset was attempted.' }
    } finally { Pop-Location }
} finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
