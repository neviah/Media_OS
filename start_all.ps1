Write-Host "Starting MediaOS local stack..."

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$RunDir = Join-Path $ProjectRoot ".run"
if (-not (Test-Path $RunDir)) {
    New-Item -ItemType Directory -Path $RunDir | Out-Null
}

$backendScript = Join-Path $ProjectRoot "backend\start.ps1"
$frontendScript = Join-Path $ProjectRoot "frontend\start.ps1"

if (-not (Test-Path $backendScript)) {
    throw "Missing backend launcher: $backendScript"
}
if (-not (Test-Path $frontendScript)) {
    throw "Missing frontend launcher: $frontendScript"
}

$backendProc = Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $backendScript
) -PassThru

$frontendProc = Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $frontendScript
) -PassThru

$pids = [ordered]@{
    backend_pid = $backendProc.Id
    frontend_pid = $frontendProc.Id
    started_at = (Get-Date).ToString("o")
}

$pids | ConvertTo-Json | Set-Content (Join-Path $RunDir "processes.json")

function Wait-Url {
    param(
        [Parameter(Mandatory = $true)] [string]$Name,
        [Parameter(Mandatory = $true)] [string]$Url,
        [int]$Attempts = 90,
        [int]$DelaySeconds = 2
    )

    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                Write-Host "[$Name] ready at $Url"
                return $true
            }
        } catch {
            # Keep waiting for service to become healthy.
        }

        Start-Sleep -Seconds $DelaySeconds
    }

    return $false
}

$backendReady = Wait-Url -Name "backend" -Url "http://127.0.0.1:8000/api/health"
$frontendReady = Wait-Url -Name "frontend" -Url "http://127.0.0.1:3000"

if (-not $backendReady -or -not $frontendReady) {
    Write-Host "One or more services failed readiness checks."
    Write-Host "Run ./stop_all.ps1, inspect terminals, then retry."
    exit 1
}

Write-Host "MediaOS is ready."
Write-Host "Frontend: http://127.0.0.1:3000"
Write-Host "Backend:  http://127.0.0.1:8000/api/health"
Write-Host "Use ./stop_all.ps1 to stop both services."
