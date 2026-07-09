# ShinRacer — Public release script
# Sanitizes and pushes a public-safe export of this repo to the public
# ShinobiFPV/ShinRacer repo, straight from this Windows machine
# (no Pi involved — this project only ever ran the Electron app here).
# Run from project root: .\scripts\publish-public.ps1 [-Message "commit message"]

param(
    [string]$Message = "ShinRacer update"
)

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$RepoUrl = "git@github.com:ShinobiFPV/ShinRacer.git"
$ExportDir = Join-Path $env:TEMP "shinracer-public-export"

Set-Location $ProjectRoot

Write-Host "==> Copying files..." -ForegroundColor Cyan
if (Test-Path $ExportDir) { Remove-Item -Recurse -Force $ExportDir }
New-Item -ItemType Directory -Path $ExportDir | Out-Null

robocopy $ProjectRoot $ExportDir /E /XD ".git" ".claude" "node_modules" "dist" "dist-electron" "release" /XF ".env" ".env.*" /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Host "FAILED: robocopy exited with code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

# File-level excludes robocopy's directory-exclusion can't express without
# also losing backend/uploads/.gitkeep
Remove-Item -Force (Join-Path $ExportDir "CLAUDE.md") -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $ExportDir "backend\uploads") -Exclude ".gitkeep" -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse
Remove-Item -Force (Join-Path $ExportDir "backend\ac_companion.db*") -ErrorAction SilentlyContinue
# These two scripts are the publish mechanism itself (like imq2's
# publish_shinagent.sh excluding itself) -- also avoids the sanitizer
# mangling its own regex source when it scrubs its own exported copy
Remove-Item -Force (Join-Path $ExportDir "scripts\publish-public.ps1") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $ExportDir "scripts\sanitize-public-export.js") -ErrorAction SilentlyContinue

Write-Host "==> Sanitizing..." -ForegroundColor Cyan
node (Join-Path $ProjectRoot "scripts\sanitize-public-export.js") $ExportDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: sanitize script errored" -ForegroundColor Red
    exit 1
}

Write-Host "==> Pushing to GitHub..." -ForegroundColor Cyan
Set-Location $ExportDir
git init -q
git add -A
git commit -q -m "$Message"
git branch -M main
git remote add origin $RepoUrl
git push -u origin main --force

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: push to $RepoUrl failed -- does the repo exist yet?" -ForegroundColor Red
    exit 1
}

Write-Host "Done: https://github.com/ShinobiFPV/ShinRacer" -ForegroundColor Green
