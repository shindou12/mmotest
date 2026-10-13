param(
  [switch]$GameOnly,
  [string]$Cloudflared = 'D:\ChromeDownLoad\cloudflared.exe'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Install the LTS version from https://nodejs.org/ and reopen this launcher.'
  }
  if (-not $GameOnly -and -not (Test-Path -LiteralPath $Cloudflared)) {
    throw "cloudflared.exe was not found at $Cloudflared. Use start-game.cmd if a tunnel is already running."
  }
  $client = New-Object System.Net.Sockets.TcpClient
  $occupied = $false
  try { $occupied = $client.ConnectAsync('127.0.0.1', 8080).Wait(500) } catch { } finally { $client.Dispose() }
  if ($occupied) { throw 'Port 8080 is already in use. Stop the old game with Ctrl+C in its npm start window, then retry. Keep the old cloudflared window open to retain its URL.' }
  $env:PORT = '8080'
  if (-not (Test-Path 'node_modules\three\package.json') -or -not (Test-Path 'node_modules\ws\package.json')) {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check the internet connection and retry.' }
  }
  $gameProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm.cmd start' -WorkingDirectory $PSScriptRoot -PassThru
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 1
      if ($health.mode -eq 'coop-hard-v1') { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'The game did not start. Check the npm start window for errors.' }
  Start-Process 'http://localhost:8080'
  if ($GameOnly) {
    Write-Host 'Co-op hard is running. Keep the npm start window and your existing cloudflared window open.'
    Write-Host 'Share the existing trycloudflare URL. Everyone should reload the page.'
  } else {
    Write-Host 'Share the https://...trycloudflare.com URL printed below. Keep both windows open.'
    & $Cloudflared tunnel --url http://localhost:8080
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
