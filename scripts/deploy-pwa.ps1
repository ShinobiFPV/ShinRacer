# ShinRacer — PWA deploy helper (builds locally, ships static files + nginx config to shinobi)
# Run from project root: .\scripts\deploy-pwa.ps1
# Requires nginx already installed on shinobi — see docs/NGINX_SETUP.md for first-time setup.
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot
Write-Host "=== ShinRacer PWA deploy -> shinobi@192.168.1.203 ===" -ForegroundColor Cyan
Write-Host "--- Step 1: building PWA ---" -ForegroundColor Cyan
cmd /c "cd pwa && npm run build"
Write-Host "--- Step 1 complete ---" -ForegroundColor Green
Write-Host "--- Step 2: creating remote directory ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo mkdir -p /var/www/shinracer-pwa && sudo chown shinobi:shinobi /var/www/shinracer-pwa"
Write-Host "--- Step 2 complete ---" -ForegroundColor Green
Write-Host "--- Step 3: copying built files ---" -ForegroundColor Cyan
scp -r pwa\dist\* shinobi@192.168.1.203:/var/www/shinracer-pwa/
Write-Host "--- Step 3 complete ---" -ForegroundColor Green
Write-Host "--- Step 4: copying nginx config ---" -ForegroundColor Cyan
scp backend\nginx\shinracer.conf shinobi@192.168.1.203:/tmp/shinracer.conf
Write-Host "--- Step 4 complete ---" -ForegroundColor Green
Write-Host "--- Step 5: installing nginx config ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo cp /tmp/shinracer.conf /etc/nginx/sites-available/shinracer"
Write-Host "--- Step 5 complete ---" -ForegroundColor Green
Write-Host "--- Step 6: enabling site ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo ln -sf /etc/nginx/sites-available/shinracer /etc/nginx/sites-enabled/shinracer"
Write-Host "--- Step 6 complete ---" -ForegroundColor Green
Write-Host "--- Step 7: testing nginx config ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo nginx -t"
Write-Host "--- Step 7 complete ---" -ForegroundColor Green
Write-Host "--- Step 8: reloading nginx ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "sudo systemctl reload nginx"
Write-Host "--- Step 8 complete ---" -ForegroundColor Green
Write-Host "--- Step 9: health check ---" -ForegroundColor Cyan
ssh shinobi@192.168.1.203 "curl -s http://localhost:8080/api/health"
Write-Host "=== Deploy finished - health check JSON printed above ===" -ForegroundColor Cyan
