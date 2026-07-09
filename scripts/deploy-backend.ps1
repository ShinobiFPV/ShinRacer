# AC Companion — Backend deploy helper (scp-based; rsync path conversion is unreliable on Windows)
# Run from project root: .\scripts\deploy-backend.ps1
# Requires passwordless sudo on shinobi for: systemctl restart ac-companion, systemctl status ac-companion
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot
Write-Host "=== AC Companion backend deploy -> shinobi@192.168.1.203 ===" -ForegroundColor Cyan
Write-Host "--- Step 1: copying backend files ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "mkdir -p /home/shinobi/ac-companion-backend/lib"
scp backend\server.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/
scp backend\db.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/
scp backend\socket.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/
scp backend\package.json shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/
scp backend\routes\events.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/routes/
scp backend\routes\stats.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/routes/
scp backend\routes\chat.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/routes/
scp backend\routes\invites.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/routes/
scp backend\routes\mods.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/routes/
scp backend\lib\drive.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/lib/
scp backend\lib\oauth.js shinobi@192.168.1.203:/home/shinobi/ac-companion-backend/lib/
Write-Host "--- Step 1 complete ---" -ForegroundColor Green
Write-Host "--- Step 2: npm install on shinobi ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "cd /home/shinobi/ac-companion-backend && npm install --omit=dev --silent"
Write-Host "--- Step 2 complete ---" -ForegroundColor Green
Write-Host "--- Step 3: restarting ac-companion service ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo systemctl restart ac-companion"
Write-Host "--- Step 3 complete ---" -ForegroundColor Green
Write-Host "--- Step 4: health check ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sleep 2 && curl -s http://localhost:3000/api/health"
Write-Host "=== Deploy finished - health check JSON printed above ===" -ForegroundColor Cyan
