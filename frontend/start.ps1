Write-Host "Starting Media Control Center Frontend..."

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Test-Path "package.json")) {
    throw "frontend/package.json is missing."
}

Write-Host "Installing frontend dependencies..."
npm install

Write-Host "Starting frontend dev server on http://localhost:3000"
npm start
