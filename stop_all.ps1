Write-Host "Stopping MediaOS local stack..."

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $ProjectRoot ".run\processes.json"

if (-not (Test-Path $pidFile)) {
    Write-Host "No process record found at .run/processes.json"
    exit 0
}

$meta = Get-Content $pidFile | ConvertFrom-Json
$trackedProcessIds = @($meta.backend_pid, $meta.frontend_pid) | Where-Object { $_ }

foreach ($processId in $trackedProcessIds) {
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Stopped PID $processId"
    } catch {
        Write-Host "PID $processId was not running."
    }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Host "Done."
