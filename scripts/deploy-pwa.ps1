# ShinRacer — PWA deploy helper (builds locally, ships static files + nginx config to your-pi)
# Run from project root: .\scripts\deploy-pwa.ps1
# Requires nginx already installed on your-pi — see docs/NGINX_SETUP.md for first-time setup.
# Requires passwordless sudo on your-pi for: mkdir/chown of /var/www/shinracer-pwa,
# cp into /etc/nginx/sites-available, ln -sf into sites-enabled, nginx -t, systemctl reload nginx.
# Without that sudoers rule, steps 2/5/6/7/8 print "sudo: a password is required" and no-op —
# harmless on a repeat deploy (the directory + nginx site are already there from the first
# real setup), but a fresh Pi needs the rule added by hand before this script can do anything
# past copying files. Example /etc/sudoers.d/shinracer-deploy entry:
#   your-pi ALL=(ALL) NOPASSWD: /usr/bin/mkdir -p /var/www/shinracer-pwa, \
#     /usr/bin/chown your-pi\:your-pi /var/www/shinracer-pwa, \
#     /usr/bin/cp /tmp/shinracer.conf /etc/nginx/sites-available/shinracer, \
#     /usr/bin/ln -sf /etc/nginx/sites-available/shinracer /etc/nginx/sites-enabled/shinracer, \
#     /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot
Write-Host "=== ShinRacer PWA deploy -> your-pi@192.168.1.100 ===" -ForegroundColor Cyan
Write-Host "--- Step 1: building PWA ---" -ForegroundColor Cyan
cmd /c "cd pwa && npm run build"
Write-Host "--- Step 1 complete ---" -ForegroundColor Green
Write-Host "--- Step 2: creating remote directory ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo mkdir -p /var/www/shinracer-pwa && sudo chown your-pi:your-pi /var/www/shinracer-pwa"
Write-Host "--- Step 2 complete ---" -ForegroundColor Green
Write-Host "--- Step 3: copying built files ---" -ForegroundColor Cyan
scp -r pwa/dist/* your-pi@192.168.1.100:/var/www/shinracer-pwa/
Write-Host "--- Step 3 complete ---" -ForegroundColor Green
Write-Host "--- Step 4: fixing permissions on copied files ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "find /var/www/shinracer-pwa -type d -exec chmod 755 {} \; ; find /var/www/shinracer-pwa -type f -exec chmod 644 {} \;"
Write-Host "--- Step 4 complete ---" -ForegroundColor Green
Write-Host "--- Step 5: copying nginx config ---" -ForegroundColor Cyan
scp backend/nginx/shinracer.conf your-pi@192.168.1.100:/tmp/shinracer.conf
Write-Host "--- Step 5 complete ---" -ForegroundColor Green
Write-Host "--- Step 6: installing nginx config ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo cp /tmp/shinracer.conf /etc/nginx/sites-available/shinracer"
Write-Host "--- Step 6 complete ---" -ForegroundColor Green
Write-Host "--- Step 7: enabling site ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo ln -sf /etc/nginx/sites-available/shinracer /etc/nginx/sites-enabled/shinracer"
Write-Host "--- Step 7 complete ---" -ForegroundColor Green
Write-Host "--- Step 8: testing nginx config ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo nginx -t"
Write-Host "--- Step 8 complete ---" -ForegroundColor Green
Write-Host "--- Step 9: reloading nginx ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "sudo systemctl reload nginx"
Write-Host "--- Step 9 complete ---" -ForegroundColor Green
Write-Host "--- Step 10: health check ---" -ForegroundColor Cyan
ssh your-pi@192.168.1.100 "curl -s http://localhost:8080/api/health"
Write-Host "=== Deploy finished - health check JSON printed above ===" -ForegroundColor Cyan
