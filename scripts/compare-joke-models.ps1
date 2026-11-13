param([switch]$Mini54Suite)
$ErrorActionPreference = 'Stop'
if (!$env:OPENAI_API_KEY) {
    $env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'OpenAI API key (hidden)' -AsSecureString)).Password.Trim()
}
if (!$env:JEV_API_KEY) {
    $env:JEV_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'Jev API key (hidden)' -AsSecureString)).Password.Trim()
}
if (!$env:OPENAI_API_KEY) { throw 'OPENAI_API_KEY is missing. No API calls were sent.' }
if (!$env:JEV_API_KEY) { throw 'JEV_API_KEY is missing. No API calls were sent.' }
$comparisonRoot = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location
try {
    Set-Location -LiteralPath (Join-Path $comparisonRoot 'backend')
    if ($Mini54Suite) { & .\gradlew.bat --no-daemon compareJokeModels -PjokeMini54Suite }
    else { & .\gradlew.bat --no-daemon compareJokeModels }
    if ($LASTEXITCODE -ne 0) { throw 'Comparison stopped. Check report.json/events.jsonl. Do not automatically retry.' }
} finally { Set-Location -LiteralPath $previousLocation }
