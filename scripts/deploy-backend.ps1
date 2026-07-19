# AC Companion — Backend deploy helper (scp-based; rsync path conversion is unreliable on Windows)
# Run from project root: .\scripts\deploy-backend.ps1
# Requires passwordless sudo on your-pi for: systemctl restart ac-companion, systemctl status ac-companion
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot
Write-Host "=== AC Companion backend deploy -> your-pi@192.168.1.100 ===" -ForegroundColor Cyan
Write-Host "--- Step 1: copying backend files ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "mkdir -p /home/your-pi/ac-companion-backend/lib"
ssh your-pi@192.168.1.100 "mkdir -p /home/your-pi/ac-companion-backend/middleware"
ssh your-pi@192.168.1.100 "mkdir -p /home/your-pi/ac-companion-backend/config"
scp backend\server.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/
scp backend\db.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/
scp backend\socket.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/
scp backend\package.json your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/
scp backend\routes\events.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\stats.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\chat.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\invites.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\mods.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\push.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\auth.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\admin.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\hosts.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\cluster.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\telemetry.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\routes\stereo.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/routes/
scp backend\middleware\auth.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/middleware/
scp backend\lib\drive.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/lib/
scp backend\lib\oauth.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/lib/
scp backend\lib\push.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/lib/
scp backend\lib\roles.js your-pi@192.168.1.100:/home/your-pi/ac-companion-backend/lib/
scp backend\nginx\shinracer.conf your-pi@192.168.1.100:/tmp/shinracer.conf
Write-Host "--- Step 1 complete ---" -ForegroundColor Green
Write-Host "--- Step 2: npm install on your-pi ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "cd /home/your-pi/ac-companion-backend && npm install --omit=dev --silent"
Write-Host "--- Step 2 complete ---" -ForegroundColor Green
Write-Host "--- Step 3: restarting ac-companion service ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo systemctl restart ac-companion"
Write-Host "--- Step 3 complete ---" -ForegroundColor Green
Write-Host "--- Step 4: health check ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sleep 2 && curl -s http://localhost:3000/api/health"
Write-Host "=== Deploy finished - health check JSON printed above ===" -ForegroundColor Cyan
