Write-Host "Starting Media Control Center Backend..."

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..."
    py -3 -m venv .venv
}

$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

Write-Host "Installing backend runtime dependencies..."
& $PythonExe -m pip install -r "backend/requirements.dev.txt"

Write-Host "Starting FastAPI server on http://127.0.0.1:8000"
& $PythonExe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
