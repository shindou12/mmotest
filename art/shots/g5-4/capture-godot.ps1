param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'godot'),
  [int]$ShotFrames = 120,
  [string]$OnlyId = '',
  [switch]$VerboseEngine
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$project = Join-Path $root 'godot/worldart'
$godot = Join-Path $env:LOCALAPPDATA 'Programs/Godot_4.3/Godot_v4.3-stable_win64_console.exe'
$shots = Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot 'shots.json') | ConvertFrom-Json
if ($OnlyId) { $shots = @($shots | Where-Object { $_.id -eq $OnlyId }) }
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$appData = Join-Path $project '.godot/user_data/g5-4'
New-Item -ItemType Directory -Force -Path $appData | Out-Null

foreach ($shot in $shots) {
  $image = Join-Path $output ($shot.id + '.png')
  $tempLog = Join-Path $env:TEMP ('g5-4-godot-' + $shot.id + '.log')
  $args = @('--path', $project, '--resolution', '1532x869', '--max-fps', '60', '--', '--auto', '--name=EliteTest', '--server=ws://127.0.0.1:8080/ws', "--start=$($shot.area)", "--shotarea=$($shot.area)", "--at=$($shot.at[0]),$($shot.at[1])", "--capture-focus=$($shot.focus[0]),$($shot.focus[1])", '--match-browser-camera', '--visual-shot', "--shot=${ShotFrames}:$image")
  if ($VerboseEngine) { $args = @('--verbose') + $args }
  if ($shot.openDoor) { $args += '--open-door' }

  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $godot
  $start.WorkingDirectory = $project
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment['APPDATA'] = $appData
  $start.Arguments = (($args | ForEach-Object { '"' + [string]$_ + '"' }) -join ' ')

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  if (-not $process.Start()) { throw "Godot did not start for $($shot.id)" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit(90000)) {
    Stop-Process -Id $process.Id -Force
    throw "Godot capture timed out for $($shot.id); stopped owned PID $($process.Id)"
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  [System.IO.File]::WriteAllText($tempLog, $stdout + [Environment]::NewLine + $stderr, [System.Text.UTF8Encoding]::new())
  $scriptErrors = Select-String -LiteralPath $tempLog -Pattern '^SCRIPT ERROR:'
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $image) -or $scriptErrors) {
    Write-Output "NG $($shot.id) exit=$($process.ExitCode) image=$((Test-Path -LiteralPath $image)) log=$tempLog"
    throw "Godot capture failed for $($shot.id)"
  }
  $size = (Get-Item -LiteralPath $image).Length
  Write-Output "OK $($shot.id) pid=$($process.Id) bytes=$size image=$image log=$tempLog"
  $summary = Select-String -LiteralPath $tempLog -Pattern '^SHOT |^CAPTURE |^CAPTURE_|^CAPTURE_MOBS |SCRIPT ERROR|ERROR:'
  foreach ($line in $summary) { Write-Output $line.Line }
}
