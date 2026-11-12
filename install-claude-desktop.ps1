# Adds this server to Claude Desktop as "hr-demo" (Windows).
# Quit Claude Desktop completely first (tray icon > Quit): while it runs it
# rewrites its config file and drops entries it did not load at startup.
$ErrorActionPreference = 'Stop'

$candidates = @(Get-ChildItem "$env:LOCALAPPDATA\Claude-Data\*\claude_desktop_config.json" -ErrorAction SilentlyContinue) +
              @(Get-Item "$env:APPDATA\Claude\claude_desktop_config.json" -ErrorAction SilentlyContinue)
$config = $candidates | Where-Object { $_ } | Select-Object -First 1
if (-not $config) { throw 'claude_desktop_config.json not found. Open Claude Desktop once, then quit it and rerun.' }

$entry = [ordered]@{
  command = (Get-Command node).Source
  args    = @((Join-Path $PSScriptRoot 'dist\index.js'))
  env     = [ordered]@{
    MSSQL_HOST                     = 'localhost'
    MSSQL_PORT                     = '1433'
    MSSQL_DATABASE                 = 'HrDemo'
    MSSQL_USER                     = 'mcp_reader'
    MSSQL_PASSWORD                 = 'Local_Demo_Reader_2026'
    MSSQL_TRUST_SERVER_CERTIFICATE = 'true'
    MAX_ROWS                       = '100'
    QUERY_TIMEOUT_MS               = '10000'
    AUDIT_LOG_PATH                 = (Join-Path $PSScriptRoot 'audit.log')
  }
}

Copy-Item $config.FullName "$($config.FullName).bak" -Force
$json = Get-Content $config.FullName -Raw | ConvertFrom-Json
if (-not $json.mcpServers) { $json | Add-Member mcpServers ([pscustomobject]@{}) }
$json.mcpServers | Add-Member 'hr-demo' $entry -Force
[IO.File]::WriteAllText($config.FullName, ($json | ConvertTo-Json -Depth 100))
"Added hr-demo to $($config.FullName) (backup: .bak). Start Claude Desktop now."
