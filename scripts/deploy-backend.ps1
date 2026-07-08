# AC Companion — Backend deploy helper
# Rsyncs backend/ to the Pi 5 (shinobi) and restarts the systemd service.
# Run from project root: .\scripts\deploy-backend.ps1

param(
    [string]$RemoteHost = "shinobi",
    [string]$RemoteUser = "pi",
    [string]$RemotePath = "~/ac-companion-backend/"
)

$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$Target = "$RemoteUser@${RemoteHost}:$RemotePath"

Write-Host "Syncing backend/ to $Target ..." -ForegroundColor Cyan
rsync -avz --delete `
    --exclude 'node_modules' `
    --exclude 'data.db*' `
    --exclude '.git' `
    "./backend/" $Target

if ($LASTEXITCODE -ne 0) { Write-Error "rsync failed"; exit 1 }

Write-Host "Installing dependencies and restarting service on $RemoteHost ..." -ForegroundColor Cyan
$RemoteCmd = "cd $RemotePath && npm install --production && sudo cp ac-companion.service /etc/systemd/system/ac-companion.service && sudo systemctl daemon-reload && sudo systemctl enable ac-companion && sudo systemctl restart ac-companion"
ssh "$RemoteUser@$RemoteHost" $RemoteCmd

if ($LASTEXITCODE -ne 0) { Write-Error "Remote deploy step failed"; exit 1 }

Write-Host "Deployed. Backend running at http://${RemoteHost}:3000" -ForegroundColor Green
